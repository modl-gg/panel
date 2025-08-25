import { Request } from 'express';

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export enum WebhookEventType {
  NEW_TICKET = 'NEW_TICKET',
  NEW_PUNISHMENT = 'NEW_PUNISHMENT',
  AUDIT_LOG = 'AUDIT_LOG'
}

class WebhookService {
  private getWebhookSettings(req: Request): any {
    // Extract webhook settings from request context
    return req.webhookSettings || null;
  }

  private getEmbedColor(type: WebhookEventType): number {
    switch (type) {
      case WebhookEventType.NEW_TICKET:
        return 0x3498db; // Blue
      case WebhookEventType.NEW_PUNISHMENT:
        return 0xe74c3c; // Red
      case WebhookEventType.AUDIT_LOG:
        return 0xf39c12; // Orange
      default:
        return 0x95a5a6; // Gray
    }
  }

  private shouldSendNotification(type: WebhookEventType, webhookSettings: any): boolean {
    if (!webhookSettings?.enabled || !webhookSettings?.discordWebhookUrl) {
      return false;
    }

    const notifications = webhookSettings.notifications || {};
    switch (type) {
      case WebhookEventType.NEW_TICKET:
        return notifications.newTickets === true;
      case WebhookEventType.NEW_PUNISHMENT:
        return notifications.newPunishments === true;
      case WebhookEventType.AUDIT_LOG:
        return notifications.auditLogs === true;
      default:
        return false;
    }
  }

  async sendWebhook(
    req: Request,
    type: WebhookEventType,
    embed: Partial<DiscordEmbed>,
    mentionAdmins: boolean = false
  ): Promise<void> {
    try {
      const webhookSettings = this.getWebhookSettings(req);
      
      if (!this.shouldSendNotification(type, webhookSettings)) {
        return;
      }

      const fullEmbed: DiscordEmbed = {
        ...embed,
        color: embed.color || this.getEmbedColor(type),
        timestamp: embed.timestamp || new Date().toISOString(),
        footer: embed.footer || {
          text: `modl Panel • ${req.serverName || 'Server'}`
        }
      };

      const payload: DiscordWebhookPayload = {
        username: webhookSettings.botName || 'modl Panel',
        avatar_url: webhookSettings.avatarUrl || undefined,
        embeds: [fullEmbed]
      };

      // Add admin role ping if requested and configured
      if (mentionAdmins && webhookSettings.discordAdminRoleId) {
        payload.content = `<@&${webhookSettings.discordAdminRoleId}>`;
      }

      const response = await fetch(webhookSettings.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Silently fail - webhook errors shouldn't break the main application
        return;
      }
    } catch (error) {
      // Silently fail - webhook errors shouldn't break the main application
      return;
    }
  }

  async sendTicketNotification(req: Request, ticket: any): Promise<void> {
    const embed = {
      title: '🎫 New Ticket Created',
      description: `A new **${ticket.type || 'support'}** ticket has been submitted.`,
      fields: [
        {
          name: 'Ticket ID',
          value: `#${ticket._id || ticket.id}`,
          inline: true
        },
        {
          name: 'Priority',
          value: ticket.priority || 'Normal',
          inline: true
        },
        {
          name: 'Category',
          value: ticket.category || 'General',
          inline: true
        },
        {
          name: 'Subject',
          value: ticket.subject || 'No subject',
          inline: false
        }
      ]
    };

    if (ticket.submittedBy) {
      embed.fields.push({
        name: 'Submitted By',
        value: ticket.submittedBy,
        inline: true
      });
    }

    await this.sendWebhook(req, WebhookEventType.NEW_TICKET, embed);
  }

  async sendPunishmentNotification(req: Request, punishment: any): Promise<void> {
    const embed = {
      title: '⚖️ New Punishment Issued',
      description: `A ${punishment.type || 'punishment'} has been issued.`,
      fields: [
        {
          name: 'Player',
          value: punishment.playerName || punishment.player || 'Unknown',
          inline: true
        },
        {
          name: 'Punishment Type',
          value: punishment.type || 'Unknown',
          inline: true
        },
        {
          name: 'Duration',
          value: punishment.duration || 'Permanent',
          inline: true
        }
      ]
    };

    if (punishment.reason) {
      embed.fields.push({
        name: 'Reason',
        value: punishment.reason,
        inline: false
      });
    }

    if (punishment.issuerName || punishment.issuer) {
      embed.fields.push({
        name: 'Issued By',
        value: punishment.issuerName || punishment.issuer,
        inline: true
      });
    }

    await this.sendWebhook(req, WebhookEventType.NEW_PUNISHMENT, embed);
  }

  async sendAuditLogNotification(req: Request, auditEntry: any): Promise<void> {
    const embed = {
      title: '📋 Audit Log Entry',
      description: `${auditEntry.action || 'Action performed'}`,
      fields: [
        {
          name: 'User',
          value: auditEntry.user || auditEntry.username || 'System',
          inline: true
        },
        {
          name: 'Action',
          value: auditEntry.action || 'Unknown',
          inline: true
        }
      ]
    };

    if (auditEntry.target) {
      embed.fields.push({
        name: 'Target',
        value: auditEntry.target,
        inline: true
      });
    }

    if (auditEntry.details) {
      embed.fields.push({
        name: 'Details',
        value: auditEntry.details,
        inline: false
      });
    }

    // Only mention admins for critical audit events
    const criticalActions = ['user_deleted', 'role_changed', 'settings_modified'];
    const mentionAdmins = criticalActions.some(action => 
      auditEntry.action?.toLowerCase().includes(action)
    );

    await this.sendWebhook(req, WebhookEventType.AUDIT_LOG, embed, mentionAdmins);
  }
}

export const webhookService = new WebhookService();