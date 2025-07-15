import { Connection } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import GeminiService from './gemini-service';
import SystemPromptsService from './system-prompts-service';
import PunishmentService from './punishment-service';

interface ChatMessage {
  username: string;
  message: string;
  timestamp: string;
}

interface AIPunishmentType {
  id: string;
  name: string;
  aiDescription: string;
  enabled: boolean;
}

interface AIAnalysisResult {
  analysis: string;
  suggestedAction: {
    punishmentTypeId: string;
    severity: 'low' | 'regular' | 'severe';
  } | null;
  wasAppliedAutomatically: boolean;
  createdAt: Date;
}

interface AISettings {
  enableAIReview: boolean;
  enableAutomatedActions: boolean;
  strictnessLevel: 'lenient' | 'standard' | 'strict';
}

export class AIModerationService {
  private dbConnection: Connection;
  private geminiService: GeminiService;
  private systemPromptsService: SystemPromptsService;
  private punishmentService: PunishmentService;

  constructor(dbConnection: Connection) {
    this.dbConnection = dbConnection;
    this.geminiService = new GeminiService();
    this.systemPromptsService = new SystemPromptsService(dbConnection);
    this.punishmentService = new PunishmentService(dbConnection);
  }

  /**
   * Analyze a chat report ticket using AI
   */
  async analyzeTicket(
    ticketId: string,
    chatMessages: ChatMessage[],
    playerIdentifier?: string,
    playerNameForAI?: string
  ): Promise<AIAnalysisResult | null> {
    try {
      // Starting AI analysis for ticket

      // Get AI settings
      const aiSettings = await this.getAISettings();
      if (!aiSettings) {
        // AI settings not found, skipping analysis
        return null;
      }

      // Get punishment types
      const punishmentTypes = await this.getPunishmentTypes();
      if (!punishmentTypes || punishmentTypes.length === 0) {
        // No punishment types found, skipping analysis
        return null;
      }

      // Get system prompt for strictness level with punishment types injected
      const systemPrompt = await this.systemPromptsService.getPromptForStrictnessLevel(
        aiSettings.strictnessLevel,
        punishmentTypes
      );

      // Analyze with Gemini
      const geminiResponse = await this.geminiService.analyzeChatMessages(
        chatMessages,
        systemPrompt,
        playerNameForAI
      );

      // Prepare AI analysis result
      const analysisResult: AIAnalysisResult = {
        analysis: geminiResponse.analysis,
        suggestedAction: geminiResponse.suggestedAction,
        wasAppliedAutomatically: false,
        createdAt: new Date()
      };

      // Apply punishment automatically if enabled and action is suggested
      if (aiSettings.enableAutomatedActions && geminiResponse.suggestedAction && playerIdentifier) {
        try {
          // Map AI punishment type ID to actual punishment type ID
          const mappedPunishmentTypeId = await this.mapAIPunishmentTypeToActual(geminiResponse.suggestedAction.punishmentTypeId);
          if (!mappedPunishmentTypeId) {
            console.error(`[AI Moderation] No mapping found for AI punishment type ${geminiResponse.suggestedAction.punishmentTypeId}`);
            throw new Error(`No mapping found for AI punishment type ${geminiResponse.suggestedAction.punishmentTypeId}`);
          }

          const punishmentResult = await this.punishmentService.applyPunishment(
            playerIdentifier,
            mappedPunishmentTypeId,
            geminiResponse.suggestedAction.severity,
            `Automated AI moderation - ${geminiResponse.analysis}`,
            ticketId
          );

          if (punishmentResult.success) {
            analysisResult.wasAppliedAutomatically = true;
            console.log(`[AI Moderation] Automatically applied punishment ${punishmentResult.punishmentId} for ticket ${ticketId}`);
          } else {
            console.error(`[AI Moderation] Failed to apply automatic punishment for ticket ${ticketId}: ${punishmentResult.error}`);
          }
        } catch (error) {
          console.error(`[AI Moderation] Failed to apply automatic punishment for ticket ${ticketId}:`, error);
          // Continue without failing the analysis
        }
      }

      // Store AI analysis in ticket data
      await this.storeAIAnalysis(ticketId, analysisResult);

      return analysisResult;
    } catch (error) {
      console.error(`[AI Moderation] Error analyzing ticket ${ticketId}:`, error);
      return null;
    }
  }

  /**
   * Store AI analysis result in ticket data
   */
  private async storeAIAnalysis(ticketId: string, analysisResult: AIAnalysisResult): Promise<void> {
    try {
      const TicketModel = this.dbConnection.model('Ticket');
      
      await TicketModel.updateOne(
        { _id: ticketId },
        {
          $set: {
            'data.aiAnalysis': analysisResult
          }
        }
      );

      console.log(`[AI Moderation] Stored analysis result for ticket ${ticketId}`);
    } catch (error) {
      console.error(`[AI Moderation] Error storing analysis for ticket ${ticketId}:`, error);
    }
  }

  /**
   * Get AI moderation settings
   */
  private async getAISettings(): Promise<AISettings | null> {
    try {
      const SettingsModel = this.dbConnection.model('Settings');
      const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });

      if (!aiSettingsDoc || !aiSettingsDoc.data) {
        return {
          enableAIReview: true,
          enableAutomatedActions: true,
          strictnessLevel: 'standard'
        };
      }

      return aiSettingsDoc.data;
    } catch (error) {
      console.error('[AI Moderation] Error fetching AI settings:', error);
      return null;
    }
  }

  /**
   * Get AI punishment types from AI moderation settings (enabled types only)
   */
  private async getPunishmentTypes(): Promise<AIPunishmentType[]> {
    try {
      const SettingsModel = this.dbConnection.model('Settings');
      const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });
      
      if (!aiSettingsDoc || !aiSettingsDoc.data || !aiSettingsDoc.data.aiPunishmentConfigs) {
        console.error('[AI Moderation] AI moderation settings or punishment configs not found.');
        return [];
      }

      const aiPunishmentConfigs = aiSettingsDoc.data.aiPunishmentConfigs;

      // Get enabled AI punishment types from the standalone configuration
      const enabledAIPunishmentTypes = Object.values(aiPunishmentConfigs)
        .filter((config: any) => config.enabled === true)
        .map((config: any) => ({
          id: config.id,
          name: config.name,
          aiDescription: config.aiDescription,
          enabled: config.enabled
        }));

      console.log(`[AI Moderation] Found ${enabledAIPunishmentTypes.length} enabled AI punishment types.`);

      return enabledAIPunishmentTypes;
    } catch (error) {
      console.error('[AI Moderation] Error fetching AI punishment types from settings:', error);
      return [];
    }
  }

  /**
   * Map AI punishment type ID to actual punishment type ID
   */
  private async mapAIPunishmentTypeToActual(aiPunishmentTypeId: string): Promise<number | null> {
    try {
      // Define mapping from AI punishment types to actual punishment types
      const mappings: Record<string, number> = {
        'chat-abuse': 6,    // Chat Abuse punishment type ID
        'anti-social': 7    // Anti Social punishment type ID
      };

      const mappedId = mappings[aiPunishmentTypeId];
      if (mappedId) {
        // Verify the punishment type exists in the database
        const SettingsModel = this.dbConnection.model('Settings');
        const punishmentTypesDoc = await SettingsModel.findOne({ type: 'punishmentTypes' });
        
        if (punishmentTypesDoc?.data) {
          const punishmentType = punishmentTypesDoc.data.find((pt: any) => pt.id === mappedId);
          if (punishmentType) {
            return mappedId;
          }
        }
      }

      console.error(`[AI Moderation] No valid mapping found for AI punishment type: ${aiPunishmentTypeId}`);
      return null;
    } catch (error) {
      console.error(`[AI Moderation] Error mapping AI punishment type ${aiPunishmentTypeId}:`, error);
      return null;
    }
  }

  /**
   * Initialize the AI moderation system
   */
  async initialize(): Promise<void> {
    try {
      // Initialize default system prompts
      await this.systemPromptsService.initializeDefaultPrompts();
      
      // Test Gemini connection
      const connectionTest = await this.geminiService.testConnection();
      if (connectionTest) {
        console.log('[AI Moderation] Successfully connected to Gemini API');
      } else {
        console.warn('[AI Moderation] Failed to connect to Gemini API - check API key');
      }
      
      console.log('[AI Moderation] Service initialized');
    } catch (error) {
      console.error('[AI Moderation] Error during initialization:', error);
    }
  }

  /**
   * Process a ticket for AI analysis (called after ticket creation)
   */
  async processNewTicket(ticketId: string, ticketData: any): Promise<void> {
    try {
      // Check if AI review is enabled
      const aiSettings = await this.getAISettings();
      if (!aiSettings || !aiSettings.enableAIReview) {
        console.log(`[AI Moderation] AI review is disabled, skipping analysis for ticket ${ticketId}`);
        return;
      }

      // Only process Chat Report tickets with chat messages
      if (ticketData.category !== 'chat' && ticketData.type !== 'chat') {
        return;
      }

      // Extract chat messages from ticket data
      let chatMessagesRaw = ticketData.chatMessages;
      if (!chatMessagesRaw) {
        // Fallback for when it might be in the 'data' map
        chatMessagesRaw = ticketData.data?.get ? ticketData.data.get('chatMessages') : ticketData.data?.chatMessages;
      }

      if (!chatMessagesRaw || !Array.isArray(chatMessagesRaw) || chatMessagesRaw.length === 0) {
        console.log(`[AI Moderation] No chat messages found for ticket ${ticketId}, skipping analysis`);
        return;
      }

      // Parse chat messages if they are strings
      const chatMessages: ChatMessage[] = chatMessagesRaw.map((msg: any) => {
        if (typeof msg === 'string') {
          try {
            return JSON.parse(msg);
          } catch (e) {
            console.error(`[AI Moderation] Failed to parse chat message string: ${msg}`, e);
            return null;
          }
        }
        return msg;
      }).filter((msg): msg is ChatMessage => msg !== null);

      if (chatMessages.length === 0) {
        console.log(`[AI Moderation] No valid chat messages found after parsing for ticket ${ticketId}, skipping analysis`);
        return;
      }

      // Get reported player's name and identifier (UUID preferred) from ticket
      const reportedPlayerName = ticketData.reportedPlayer || ticketData.relatedPlayer;
      const reportedPlayerIdentifier = ticketData.reportedPlayerUuid || ticketData.relatedPlayerUuid || reportedPlayerName;

      if (!reportedPlayerIdentifier) {
        console.log(`[AI Moderation] No reported player identifier found for ticket ${ticketId}, skipping punishment application.`);
      }

      // Run analysis asynchronously
      setImmediate(() => {
        this.analyzeTicket(ticketId, chatMessages, reportedPlayerIdentifier, reportedPlayerName)
          .catch(error => {
            console.error(`[AI Moderation] Async analysis failed for ticket ${ticketId}:`, error);
          });
      });

      console.log(`[AI Moderation] Queued analysis for ticket ${ticketId}`);
    } catch (error) {
      console.error(`[AI Moderation] Error processing new ticket ${ticketId}:`, error);
    }
  }
}

export default AIModerationService; 