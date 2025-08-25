import { Connection } from 'mongoose';
import { getAllSettings } from '../routes/settings-routes';

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp: string;
  footer?: {
    text: string;
  };
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
  content?: string;
}

export class DiscordWebhookService {
  private dbConnection: Connection;

  constructor(dbConnection: Connection) {
    this.dbConnection = dbConnection;
  }

  private replaceTemplateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : 'Unknown';
    });
  }

  private hexToDecimalColor(hex: string): number {
    const cleanHex = hex.replace('#', '');
    return parseInt(cleanHex, 16);
  }

  private async getWebhookSettings(): Promise<any> {
    try {
      const settings = await getAllSettings(this.dbConnection);
      // First try to get from new webhook settings structure
      if (settings.webhookSettings?.enabled && settings.webhookSettings?.discordWebhookUrl) {
        return settings.webhookSettings;
      }
      // Fallback to old general settings structure for backward compatibility
      if (settings.general?.discordWebhookUrl) {
        return {
          discordWebhookUrl: settings.general.discordWebhookUrl,
          botName: 'modl Panel',
          avatarUrl: settings.general.panelIconUrl || '',
          enabled: true,
          notifications: {
            newTickets: false, // Default off for legacy setups
            newPunishments: true,
            auditLogs: false
          }
        };
      }
      return null;
    } catch (error) {
      console.error('[Discord Webhook] Error getting webhook settings:', error);
      return null;
    }
  }

  private async sendWebhook(payload: Partial<DiscordWebhookPayload>, notificationType?: 'newTickets' | 'newPunishments' | 'auditLogs'): Promise<void> {
    const webhookSettings = await this.getWebhookSettings();
    
    if (!webhookSettings) {
      return; // Silently skip if no webhook configured
    }

    // Check if this notification type is enabled
    if (notificationType && webhookSettings.notifications && !webhookSettings.notifications[notificationType]) {
      return; // Skip if this notification type is disabled
    }

    // Get panel icon URL as fallback
    const settings = await getAllSettings(this.dbConnection);
    const panelIconUrl = settings.general?.panelIconUrl;
    
    // Convert relative avatar URL to absolute URL if needed
    let finalAvatarUrl = payload.avatar_url || webhookSettings.avatarUrl || panelIconUrl;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('/')) {
      // For relative URLs, we can't easily get the host here, so just use as-is
      // The calling code should have already handled this conversion
    }

    const fullPayload: DiscordWebhookPayload = {
      ...payload,
      embeds: payload.embeds || [],
      username: payload.username || webhookSettings.botName || 'modl Panel',
      avatar_url: finalAvatarUrl && finalAvatarUrl.match(/^https?:\/\//) ? finalAvatarUrl : undefined
    };

    try {
      const response = await fetch(webhookSettings.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fullPayload),
      });

      if (!response.ok) {
        // Silently fail for production stability
        return;
      }
    } catch (error) {
      // Silently fail for production stability
      return;
    }
  }

  async sendPunishmentNotification(punishment: {
    id: string;
    playerName: string;
    punishmentType: string;
    severity: string;
    reason: string;
    duration?: string;
    issuer: string;
    ticketId?: string;
  }): Promise<void> {
    const webhookSettings = await this.getWebhookSettings();
    if (!webhookSettings?.embedTemplates?.newPunishments) {
      return; // No template configured
    }

    const template = webhookSettings.embedTemplates.newPunishments;
    const variables = {
      id: punishment.id,
      playerName: punishment.playerName,
      type: punishment.punishmentType,
      severity: punishment.severity?.charAt(0).toUpperCase() + punishment.severity?.slice(1) || 'Unknown',
      reason: punishment.reason,
      duration: punishment.duration || 'Permanent',
      issuer: punishment.issuer,
      ticketId: punishment.ticketId
    };

    const embed: DiscordEmbed = {
      title: this.replaceTemplateVariables(template.title, variables),
      description: this.replaceTemplateVariables(template.description, variables),
      color: this.hexToDecimalColor(template.color),
      fields: template.fields
        .filter(field => {
          // Filter out fields with empty values unless they're required
          const replacedValue = this.replaceTemplateVariables(field.value, variables);
          return replacedValue !== 'Unknown' || ['id', 'playerName', 'type', 'reason', 'issuer'].some(key => field.value.includes(`{{${key}}}`));
        })
        .map(field => ({
          name: this.replaceTemplateVariables(field.name, variables),
          value: this.replaceTemplateVariables(field.value, variables).substring(0, 1024),
          inline: field.inline
        })),
      timestamp: new Date().toISOString(),
      footer: {
        text: `modl Panel • Punishment ID: ${punishment.id}`,
      },
    };

    await this.sendWebhook({ embeds: [embed] }, 'newPunishments');
  }

  async sendTicketCompletionNotification(ticket: {
    id: string;
    type: string;
    title?: string;
    status: string;
    closedBy?: string;
    resolution?: string;
    createdBy?: string;
  }): Promise<void> {
    const embed: DiscordEmbed = {
      title: '🎫 Ticket Completed',
      color: 0x44ff44, // Green color
      fields: [
        {
          name: 'Ticket ID',
          value: ticket.id,
          inline: true,
        },
        {
          name: 'Type',
          value: ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1),
          inline: true,
        },
        {
          name: 'Status',
          value: ticket.status,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    if (ticket.title) {
      embed.fields!.push({
        name: 'Title',
        value: ticket.title,
        inline: false,
      });
    }

    if (ticket.createdBy) {
      embed.fields!.push({
        name: 'Created By',
        value: ticket.createdBy,
        inline: true,
      });
    }

    if (ticket.closedBy) {
      embed.fields!.push({
        name: 'Closed By',
        value: ticket.closedBy,
        inline: true,
      });
    }

    if (ticket.resolution) {
      embed.fields!.push({
        name: 'Resolution',
        value: ticket.resolution.length > 1024 ? ticket.resolution.substring(0, 1021) + '...' : ticket.resolution,
        inline: false,
      });
    }

    await this.sendWebhook({ embeds: [embed] }, 'newTickets');
  }

  async sendNewTicketNotification(ticket: {
    id: string;
    type: string;
    title?: string;
    priority?: string;
    category?: string;
    submittedBy?: string;
  }): Promise<void> {
    const webhookSettings = await this.getWebhookSettings();
    if (!webhookSettings?.embedTemplates?.newTickets) {
      return; // No template configured
    }

    const template = webhookSettings.embedTemplates.newTickets;
    const variables = {
      id: ticket.id,
      type: ticket.type,
      title: ticket.title || 'No subject provided',
      priority: ticket.priority || 'Normal',
      category: ticket.category || ticket.type,
      submittedBy: ticket.submittedBy || 'Unknown user'
    };

    const embed: DiscordEmbed = {
      title: this.replaceTemplateVariables(template.title, variables),
      description: this.replaceTemplateVariables(template.description, variables),
      color: this.hexToDecimalColor(template.color),
      fields: template.fields
        .filter(field => {
          // Filter out fields with empty values unless they're required
          const replacedValue = this.replaceTemplateVariables(field.value, variables);
          return replacedValue !== 'Unknown' && replacedValue !== 'No subject provided' && replacedValue !== 'Unknown user' 
            || ['id', 'type'].some(key => field.value.includes(`{{${key}}}`));
        })
        .map(field => ({
          name: this.replaceTemplateVariables(field.name, variables),
          value: this.replaceTemplateVariables(field.value, variables).substring(0, 1024),
          inline: field.inline
        })),
      timestamp: new Date().toISOString(),
      footer: {
        text: `modl Panel • Ticket Created`,
      },
    };

    await this.sendWebhook({ embeds: [embed] }, 'newTickets');
  }
}