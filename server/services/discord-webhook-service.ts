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
}

export class DiscordWebhookService {
  private dbConnection: Connection;

  constructor(dbConnection: Connection) {
    this.dbConnection = dbConnection;
  }

  private async getWebhookUrl(): Promise<string | null> {
    try {
      const settings = await getAllSettings(this.dbConnection);
      return settings.general?.discordWebhookUrl || null;
    } catch (error) {
      console.error('[Discord Webhook] Error getting webhook URL from settings:', error);
      return null;
    }
  }

  private async sendWebhook(payload: DiscordWebhookPayload): Promise<void> {
    const webhookUrl = await this.getWebhookUrl();
    
    if (!webhookUrl || !webhookUrl.trim()) {
      return; // Silently skip if no webhook configured
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Discord Webhook] Failed to send webhook: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Discord Webhook] Error sending webhook:', error);
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
    const embed: DiscordEmbed = {
      title: '⚖️ New Punishment Issued',
      color: 0xff4444, // Red color
      fields: [
        {
          name: 'Player',
          value: punishment.playerName,
          inline: true,
        },
        {
          name: 'Punishment Type',
          value: punishment.punishmentType,
          inline: true,
        },
        {
          name: 'Severity',
          value: punishment.severity.charAt(0).toUpperCase() + punishment.severity.slice(1),
          inline: true,
        },
        {
          name: 'Reason',
          value: punishment.reason,
          inline: false,
        },
        {
          name: 'Issued By',
          value: punishment.issuer,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Punishment ID: ${punishment.id}`,
      },
    };

    if (punishment.duration) {
      embed.fields!.splice(3, 0, {
        name: 'Duration',
        value: punishment.duration,
        inline: true,
      });
    }

    if (punishment.ticketId) {
      embed.fields!.push({
        name: 'Related Ticket',
        value: punishment.ticketId,
        inline: true,
      });
    }

    await this.sendWebhook({ embeds: [embed] });
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

    await this.sendWebhook({ embeds: [embed] });
  }
}