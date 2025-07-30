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
    punishmentTypeId: string | number;
    severity: 'low' | 'regular' | 'severe';
    originalAITypeId?: string; // Store original AI type ID for reference
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
      
      
      punishmentTypes.forEach(pt => {
        console.log(`  - ID: ${pt.id}, Name: ${pt.name}, Description: ${pt.aiDescription}`);
      });

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

      // Map AI punishment type ID to actual punishment type ID for storage
      let mappedPunishmentTypeId: number | null = null;
      if (geminiResponse.suggestedAction) {
        
        
        
        mappedPunishmentTypeId = await this.mapAIPunishmentTypeToActual(geminiResponse.suggestedAction.punishmentTypeId);
        if (!mappedPunishmentTypeId) {
          console.error(`[AI Moderation] No mapping found for AI punishment type ${geminiResponse.suggestedAction.punishmentTypeId}`);
        }
      }

      // Prepare AI analysis result with mapped punishment type ID
      const analysisResult: AIAnalysisResult = {
        analysis: geminiResponse.analysis,
        suggestedAction: geminiResponse.suggestedAction ? {
          punishmentTypeId: mappedPunishmentTypeId || parseInt(geminiResponse.suggestedAction.punishmentTypeId) || geminiResponse.suggestedAction.punishmentTypeId, // Use mapped ID if available
          severity: geminiResponse.suggestedAction.severity,
          originalAITypeId: geminiResponse.suggestedAction.punishmentTypeId // Store original for reference
        } : null,
        wasAppliedAutomatically: false,
        createdAt: new Date()
      };

      // Apply punishment automatically if enabled and action is suggested
      if (aiSettings.enableAutomatedActions && geminiResponse.suggestedAction && playerIdentifier && mappedPunishmentTypeId) {
        try {

          const punishmentResult = await this.punishmentService.applyPunishment(
            playerIdentifier,
            mappedPunishmentTypeId,
            geminiResponse.suggestedAction.severity,
            `Automated AI moderation - ${geminiResponse.analysis}`,
            ticketId
          );

          if (punishmentResult.success) {
            analysisResult.wasAppliedAutomatically = true;
            
            // Create an "Accept Report" reply for automated actions
            await this.createAcceptReportReply(ticketId, geminiResponse.suggestedAction.severity, geminiResponse.analysis, punishmentResult.punishmentId, 'AI Moderation System');
            
            
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
          enableAIReview: false,
          enableAutomatedActions: false,
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
      
      // Get actual punishment types from database
      const punishmentTypesDoc = await SettingsModel.findOne({ type: 'punishmentTypes' });
      if (!punishmentTypesDoc?.data) {
        console.error('[AI Moderation] No punishment types found in database.');
        return [];
      }
      
      // Get AI moderation settings to see which punishment types are enabled for AI
      const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });
      if (!aiSettingsDoc?.data?.aiPunishmentConfigs) {
        console.error('[AI Moderation] AI moderation settings not found.');
        return [];
      }

      const aiPunishmentConfigs = aiSettingsDoc.data.aiPunishmentConfigs;
      const actualPunishmentTypes = punishmentTypesDoc.data;

      if (!aiPunishmentConfigs || Object.keys(aiPunishmentConfigs).length === 0) {
        console.warn('[AI Moderation] No AI punishment configs found in settings');
        return [];
      }

      console.log(`[AI Moderation] AI punishment configs:`, JSON.stringify(aiPunishmentConfigs, null, 2));
      

      // Map AI punishment configs to actual punishment types
      const enabledAIPunishmentTypes: AIPunishmentType[] = [];
      
      Object.values(aiPunishmentConfigs).forEach((config: any) => {
        
        
        if (config.enabled === true) {
          let actualPunishmentType = null;
          
          // First, try to find by explicit mapping if it exists
          if (config.mappedPunishmentTypeId) {
            actualPunishmentType = actualPunishmentTypes.find((pt: any) => 
              pt.id === config.mappedPunishmentTypeId || pt.ordinal === config.mappedPunishmentTypeId
            );
          }
          
          // If no explicit mapping, try to find by name similarity
          if (!actualPunishmentType) {
            actualPunishmentType = actualPunishmentTypes.find((pt: any) => 
              pt.name.toLowerCase().includes(config.name.toLowerCase()) ||
              config.name.toLowerCase().includes(pt.name.toLowerCase())
            );
          }
          
          // As a fallback, use default mappings for known AI configs
          if (!actualPunishmentType) {
            const defaultMappings: Record<string, number> = {
              'chat-abuse': 6,    // Default Chat Abuse punishment type ordinal
              'anti-social': 7    // Default Anti Social punishment type ordinal
            };
            
            const defaultOrdinal = defaultMappings[config.id];
            if (defaultOrdinal) {
              actualPunishmentType = actualPunishmentTypes.find((pt: any) => pt.ordinal === defaultOrdinal);
            }
          }
          
          if (actualPunishmentType) {
            enabledAIPunishmentTypes.push({
              id: actualPunishmentType.ordinal.toString(), // Use actual ordinal as string
              name: actualPunishmentType.name,
              aiDescription: config.aiDescription || `Apply ${actualPunishmentType.name} punishment`,
              enabled: true
            });
            
          } else {
            console.warn(`[AI Moderation] Could not find actual punishment type for AI config: ${config.name} (id: ${config.id})`);
          }
        }
      });

      // If no AI punishment types were found, the AI should not make punishment suggestions
      if (enabledAIPunishmentTypes.length === 0) {
        console.warn('[AI Moderation] No enabled AI punishment configs found - AI will not suggest punishments');
        console.warn('[AI Moderation] Configure AI punishment types in the AI Moderation Settings to enable punishment suggestions');
        return [];
      }

      
      

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
      // Since we now provide actual punishment type ordinals as strings to the AI,
      // we can directly parse the string to get the numeric ID
      const numericId = parseInt(aiPunishmentTypeId);
      
      if (isNaN(numericId)) {
        console.error(`[AI Moderation] Invalid punishment type ID format: ${aiPunishmentTypeId}`);
        return null;
      }
      
      // Verify the punishment type exists in the database
      const SettingsModel = this.dbConnection.model('Settings');
      const punishmentTypesDoc = await SettingsModel.findOne({ type: 'punishmentTypes' });
      
      if (punishmentTypesDoc?.data) {
        const punishmentType = punishmentTypesDoc.data.find((pt: any) => pt.ordinal === numericId);
        if (punishmentType) {
          
          return numericId;
        }
      }

      console.error(`[AI Moderation] No valid punishment type found for ordinal: ${numericId}`);
      return null;
    } catch (error) {
      console.error(`[AI Moderation] Error mapping AI punishment type ${aiPunishmentTypeId}:`, error);
      return null;
    }
  }

  /**
   * Create an "Accept Report" reply when AI suggestion is applied
   */
  private async createAcceptReportReply(
    ticketId: string, 
    severity: string, 
    analysis: string, 
    punishmentId: string, 
    staffName: string
  ): Promise<void> {
    try {
      const TicketModel = this.dbConnection.model('Ticket');
      const ticket = await TicketModel.findById(ticketId);
      
      if (!ticket) {
        console.error(`[AI Moderation] Ticket ${ticketId} not found for adding accept report reply`);
        return;
      }

      // Create an "Accept Report" reply
      const acceptReply = {
        name: staffName,
        content: `This report has been reviewed and accepted. A ${severity} severity punishment has been applied to the reported player.`,
        type: 'public',
        staff: true,
        action: 'Accept Report',
        created: new Date()
      };
      
      // Add the reply to the ticket
      ticket.replies.push(acceptReply);
      
      // Add staff note with AI analysis details
      const staffNote = {
        content: `AI Analysis: ${analysis}\n\nPunishment Applied: ${punishmentId}\nApplied by: ${staffName}\nSeverity: ${severity}`,
        author: staffName,
        createdBy: staffName,
        createdAt: new Date(),
        type: 'ai_analysis'
      };
      
      if (!ticket.notes) {
        ticket.notes = [];
      }
      ticket.notes.push(staffNote);
      
      await ticket.save();
      
      
    } catch (error) {
      console.error(`[AI Moderation] Error creating accept report reply for ticket ${ticketId}:`, error);
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
        
      } else {
        console.warn('[AI Moderation] Failed to connect to Gemini API - check API key');
      }
      
      
    } catch (error) {
      console.error('[AI Moderation] Error during initialization:', error);
    }
  }

  /**
   * Process a ticket for AI analysis (called after ticket creation)
   */
  async processNewTicket(ticketId: string, ticketData: any, serverInfo?: any): Promise<void> {
    try {
      // Check if AI review is enabled
      const aiSettings = await this.getAISettings();
      if (!aiSettings || !aiSettings.enableAIReview) {
        
        return;
      }

      // Check if server has premium subscription before proceeding with AI analysis
      if (serverInfo) {
        const isPremium = serverInfo && (
          (serverInfo.subscription_status === 'active' && serverInfo.plan === 'premium') ||
          (serverInfo.subscription_status === 'canceled' && serverInfo.plan === 'premium' && 
           serverInfo.current_period_end && new Date(serverInfo.current_period_end) > new Date())
        );
        
        if (!isPremium) {
          console.log(`[AI Moderation] Skipping AI analysis for ticket ${ticketId} - Premium subscription required`);
          return;
        }
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
        
        return;
      }

      // Get reported player's name and identifier (UUID preferred) from ticket
      const reportedPlayerName = ticketData.reportedPlayer || ticketData.relatedPlayer;
      const reportedPlayerIdentifier = ticketData.reportedPlayerUuid || ticketData.relatedPlayerUuid || reportedPlayerName;

      if (!reportedPlayerIdentifier) {
        
      }

      // Run analysis asynchronously
      setImmediate(() => {
        this.analyzeTicket(ticketId, chatMessages, reportedPlayerIdentifier, reportedPlayerName)
          .catch(error => {
            console.error(`[AI Moderation] Async analysis failed for ticket ${ticketId}:`, error);
          });
      });

      
    } catch (error) {
      console.error(`[AI Moderation] Error processing new ticket ${ticketId}:`, error);
    }
  }
}

export default AIModerationService; 