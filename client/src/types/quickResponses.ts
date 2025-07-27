export interface QuickResponseAction {
  id: string;
  name: string;
  message: string;
  order: number;
  closeTicket?: boolean; // Whether this action should close the ticket
  
  // Punishment flag - determines if punishment interface should be shown for this response
  showPunishment?: boolean;
  
  // For appeal actions (simplified - no duration reduction settings here)
  appealAction?: 'pardon' | 'reduce' | 'reject' | 'none';
}

export interface QuickResponseCategory {
  id: string;
  name: string;
  ticketTypes: string[]; // ['player_report', 'chat_report', 'bug_report', 'appeal', 'support', 'application']
  actions: QuickResponseAction[];
  order: number;
}

export interface QuickResponsesConfiguration {
  categories: QuickResponseCategory[];
}

// Default configuration that will be used for provisioning
export const defaultQuickResponsesConfig: QuickResponsesConfiguration = {
  categories: [
    {
      id: 'chat_report_actions',
      name: 'Chat Report Actions',
      ticketTypes: ['chat_report'],
      order: 1,
      actions: [
        {
          id: 'accept_report',
          name: 'Accept Report',
          message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment.',
          order: 1,
          closeTicket: true,
          showPunishment: true,
        },
        {
          id: 'reject_insufficient_chat',
          name: 'Reject - Insufficient Evidence',
          message: 'Thank you for submitting this chat report. After reviewing the evidence provided, we need additional evidence to proceed with action.',
          order: 2,
          closeTicket: false,
        },
        {
          id: 'reject_no_violation_chat',
          name: 'Reject - No Violation',
          message: 'Thank you for submitting this chat report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
          order: 3,
          closeTicket: true,
        }
      ]
    },
    {
      id: 'player_report_actions',
      name: 'Player Report Actions',
      ticketTypes: ['player_report'],
      order: 2,
      actions: [
        {
          id: 'accept_report',
          name: 'Accept Report',
          message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment.',
          order: 1,
          closeTicket: true,
          showPunishment: true,
        },
        {
          id: 'reject_insufficient_player',
          name: 'Reject - Insufficient Evidence',
          message: 'Thank you for submitting this player report. After reviewing the evidence provided, we need additional evidence to proceed with action.',
          order: 2,
          closeTicket: false,
        },
        {
          id: 'reject_no_violation_player',
          name: 'Reject - No Violation',
          message: 'Thank you for submitting this player report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
          order: 3,
          closeTicket: true,
        }
      ]
    },
    {
      id: 'appeal_actions',
      name: 'Appeal Actions',
      ticketTypes: ['appeal'],
      order: 2,
      actions: [
        {
          id: 'pardon_full',
          name: 'Pardon - Full',
          message: 'After reviewing your appeal, we have decided to remove the punishment completely. We apologize for any inconvenience.',
          order: 1,
          appealAction: 'pardon',
          closeTicket: true,
        },
        {
          id: 'reduce_punishment',
          name: 'Reduce Punishment',
          message: 'We have reviewed your appeal and decided to reduce the duration of your punishment. Please check your punishment details for the updated duration.',
          order: 2,
          appealAction: 'reduce',
          closeTicket: true,
        },
        {
          id: 'reject_upheld',
          name: 'Reject - Upheld',
          message: 'After careful consideration of your appeal, we have decided to uphold the original punishment.',
          order: 3,
          appealAction: 'reject',
          closeTicket: true,
        },
        {
          id: 'need_more_info_appeal',
          name: 'Need More Information',
          message: 'We need additional information to process your appeal. Please provide more details about your situation.',
          order: 4,
          closeTicket: false,
        }
      ]
    },
    {
      id: 'application_actions',
      name: 'Staff Application Actions',
      ticketTypes: ['application'],
      order: 3,
      actions: [
        {
          id: 'accept_builder',
          name: 'Accept - Builder',
          message: 'Congratulations! Your Builder application has been accepted. Welcome to the Builder team! You will receive further instructions and permissions shortly.',
          order: 1,
          closeTicket: true,
        },
        {
          id: 'accept_helper',
          name: 'Accept - Helper',
          message: 'Congratulations! Your Helper application has been accepted. Welcome to the Helper team! You will receive further instructions and permissions shortly.',
          order: 2,
          closeTicket: true,
        },
        {
          id: 'accept_developer',
          name: 'Accept - Developer',
          message: 'Congratulations! Your Developer application has been accepted. Welcome to the Developer team! You will receive further instructions and permissions shortly.',
          order: 3,
          closeTicket: true,
        },
        {
          id: 'reject_application',
          name: 'Reject Application',
          message: 'Thank you for your interest in joining our team. Unfortunately, we have decided not to move forward with your application at this time. You may reapply in the future.',
          order: 4,
          closeTicket: true,
        },
        {
          id: 'pending_review',
          name: 'Pending Review',
          message: 'Thank you for your application. We are currently reviewing it and will get back to you soon.',
          order: 5,
          closeTicket: false,
        },
        {
          id: 'interview_scheduled',
          name: 'Interview Scheduled',
          message: 'Your application has progressed to the interview stage. Please check your email for interview details.',
          order: 6,
          closeTicket: false,
        },
        {
          id: 'need_more_info_app',
          name: 'Need More Information',
          message: 'We need additional information about your application. Please provide more details about your experience and qualifications.',
          order: 7,
          closeTicket: false,
        }
      ]
    },
    {
      id: 'bug_actions',
      name: 'Bug Report Actions',
      ticketTypes: ['bug'],
      order: 4,
      actions: [
        {
          id: 'completed',
          name: 'Fixed',
          message: 'Thank you for reporting this bug. We have fixed the issue and it will be included in our next update.',
          order: 1,
          closeTicket: true,
        },
        {
          id: 'investigating',
          name: 'Investigating',
          message: 'Thank you for this bug report. We are currently investigating the issue and will provide updates as they become available.',
          order: 2,
          closeTicket: false,
        },
        {
          id: 'need_more_info',
          name: 'Need More Info',
          message: 'Thank you for this bug report. We need additional information to investigate this issue. Please provide more details about how to reproduce this bug.',
          order: 3,
          closeTicket: false,
        },
        {
          id: 'duplicate',
          name: 'Duplicate',
          message: 'This bug has been identified as a duplicate of an existing issue. We appreciate your report and are working on a fix.',
          order: 4,
          closeTicket: true,
        },
        {
          id: 'cannot_reproduce',
          name: 'Cannot Reproduce',
          message: 'We were unable to reproduce this issue. If you continue to experience this problem, please provide additional details.',
          order: 5,
          closeTicket: true,
        }
      ]
    },
    {
      id: 'support_actions',
      name: 'Support Actions',
      ticketTypes: ['support'],
      order: 5,
      actions: [
        {
          id: 'resolved',
          name: 'Resolved',
          message: 'Your support request has been resolved. If you need further assistance, please feel free to create a new ticket.',
          order: 1,
          closeTicket: true,
        },
        {
          id: 'escalated',
          name: 'Escalated',
          message: 'Your support request has been escalated to our specialized team. They will contact you with additional information.',
          order: 2,
          closeTicket: false,
        },
        {
          id: 'need_info_support',
          name: 'Need More Info',
          message: 'We need additional information to assist you with your request. Please provide more details about your issue.',
          order: 3,
          closeTicket: false,
        }
      ]
    },
    {
      id: 'general_actions',
      name: 'General Actions',
      ticketTypes: ['bug', 'support', 'application'],
      order: 6,
      actions: [
        {
          id: 'acknowledge',
          name: 'Acknowledge',
          message: 'Thank you for your message. We have received your ticket and will review it shortly.',
          order: 1,
          closeTicket: false,
        },
        {
          id: 'follow_up',
          name: 'Follow Up',
          message: 'We are following up on your ticket. Please let us know if you have any additional information or questions.',
          order: 2,
          closeTicket: false,
        }
      ]
    }
  ]
};