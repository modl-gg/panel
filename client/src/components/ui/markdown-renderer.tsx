import ReactMarkdown from 'react-markdown';
import { cn } from '@modl-gg/shared-web/lib/utils';
import { ClickablePlayer } from './clickable-player';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  allowHtml?: boolean;
  disableClickablePlayers?: boolean;
}

// Function to process chat message lines and make usernames clickable
const processMarkdownContent = (content: string, disableClickablePlayers = false): string => {
  // First, check if content contains JSON-formatted chat messages
  if (content.includes('**Chat Messages:**')) {
    const chatHeaderIndex = content.indexOf('**Chat Messages:**');
    const beforeChat = content.substring(0, chatHeaderIndex);
    const afterChatHeader = content.substring(chatHeaderIndex + '**Chat Messages:**'.length);
    
    // Find where the chat messages section ends (usually at the next ** or end of content)
    let chatSectionEnd = afterChatHeader.search(/\n\*\*[^*]+\*\*:|$/);
    if (chatSectionEnd === -1) chatSectionEnd = afterChatHeader.length;
    
    const chatSection = afterChatHeader.substring(0, chatSectionEnd);
    const afterChat = afterChatHeader.substring(chatSectionEnd);
    
    // Process the chat section
    const lines = chatSection.split('\n');
    let formattedMessages = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Try to parse JSON objects
      if (trimmedLine.startsWith('{') && trimmedLine.includes('"username"') && trimmedLine.includes('"message"')) {
        try {
          const msgObj = JSON.parse(trimmedLine);
          if (msgObj.username && msgObj.message) {
            const timestamp = msgObj.timestamp ? new Date(msgObj.timestamp).toLocaleString() : 'Unknown time';
            // Format as a single line with proper spacing
            formattedMessages += `  \n[${timestamp}] **${msgObj.username}**: ${msgObj.message}`;
          } else {
            formattedMessages += `  \n${line}`;
          }
        } catch (e) {
          // If JSON parsing fails, keep the original line
          formattedMessages += `  \n${line}`;
        }
      } else {
        formattedMessages += `  \n${line}`;
      }
    }
    
    // Reconstruct the content with formatted messages
    content = beforeChat + '**Chat Messages:**' + formattedMessages + afterChat;
  }
  
  // Look for already formatted chat message pattern and make usernames clickable
  const chatMessagePattern = /\*\*([^*\n]+)\*\*:/g;
  
  // Only process player links if not disabled
  if (disableClickablePlayers) {
    return content;
  }
  
  return content.replace(chatMessagePattern, (match, username) => {
    // Only replace if this looks like a player username (not other bold text like section headers)
    if (username && !username.includes(':') && !username.includes('\n') && !username.includes('Chat Messages')) {
      return `**[PLAYER:${username}]**:`;
    }
    return match;
  });
};

const MarkdownRenderer = ({ content, className, allowHtml = false, disableClickablePlayers = false }: MarkdownRendererProps) => {
  const processedContent = processMarkdownContent(content, disableClickablePlayers);
  
  // Check if content contains structured form data (bullet points, bold labels)
  const hasStructuredContent = /\*\*[^*]+\*\*:\s*\n(•[^\n]*\n?)+/.test(content);
  
  if (hasStructuredContent) {
    // For structured content (like appeal form data), use pre-wrap to preserve formatting
    return (
      <div className={cn(
        "text-sm whitespace-pre-wrap break-words",
        className
      )}>
        {/* Parse and render the structured content manually */}
        {content.split('\n').map((line, index) => {
          // Handle bold labels
          if (line.match(/^\*\*[^*]+\*\*:/)) {
            const label = line.replace(/^\*\*([^*]+)\*\*:/, '$1');
            return (
              <div key={index} className="font-semibold mt-2 first:mt-0">
                {label}:
              </div>
            );
          }
          // Handle bullet points
          if (line.startsWith('• ')) {
            return (
              <div key={index} className="ml-4">
                {line}
              </div>
            );
          }
          // Handle regular lines
          if (line.trim()) {
            return (
              <div key={index}>
                {line}
              </div>
            );
          }
          // Empty lines
          return <div key={index} className="h-2" />;
        })}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "prose prose-sm max-w-none",
      "prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground",
      "prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
      "prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border",
      "prose-blockquote:text-muted-foreground prose-blockquote:border-l-border",
      "prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
      "prose-hr:border-border",
      className
    )}>
      <ReactMarkdown
        skipHtml={!allowHtml}
        components={{
          // Custom strong (bold) renderer to handle player links
          strong: ({ children, ...props }) => {
            const text = children?.toString() || '';
            const playerMatch = text.match(/^\[PLAYER:(.*)\]$/);
            
            if (playerMatch && !disableClickablePlayers) {
              const username = playerMatch[1];
              return (
                <ClickablePlayer playerText={username} variant="text" showIcon={false}>
                  <strong className="text-primary cursor-pointer hover:underline">
                    {username}
                  </strong>
                </ClickablePlayer>
              );
            }
            
            return <strong {...props}>{children}</strong>;
          },
          // Custom link renderer to handle media URLs and external links
          a: ({ href, children, ...props }) => {
            // Check if this is a media URL that should be embedded
            const isMediaUrl = href && (
              href.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) ||
              href.match(/\.(mp4|webm|mov)(\?.*)?$/i)
            );
            
            if (isMediaUrl) {
              const isImage = href.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i);
              const isVideo = href.match(/\.(mp4|webm|mov)(\?.*)?$/i);
              
              if (isImage) {
                return (
                  <div className="my-4">
                    <img 
                      src={href} 
                      alt={children?.toString() || "Media"}
                      className="max-w-full h-auto rounded border"
                      style={{ maxWidth: '500px' }}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      <a 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        View full size
                      </a>
                    </div>
                  </div>
                );
              } else if (isVideo) {
                return (
                  <div className="my-4">
                    <video 
                      src={href} 
                      controls 
                      className="max-w-full h-auto rounded border"
                      style={{ maxWidth: '500px' }}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      <a 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>
                );
              }
            }
            
            // Default link behavior for non-media URLs
            return (
              <a 
                href={href} 
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          // Custom code block renderer
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            
            if (isInline) {
              return (
                <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            
            return (
              <pre className="bg-muted p-3 rounded border overflow-auto">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          // Custom blockquote renderer
          blockquote: ({ children, ...props }) => (
            <blockquote 
              className="border-l-4 border-border pl-4 py-2 bg-muted/30 rounded-r"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Ensure lists have proper spacing
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside space-y-1" {...props}>
              {children}
            </ol>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;