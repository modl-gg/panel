import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import MarkdownRenderer from './markdown-renderer';

const MarkdownHelp = () => {
  const [isOpen, setIsOpen] = useState(false);

  const exampleMarkdown = `**Bold text** and *italic text*

\`inline code\` and code blocks:
\`\`\`
console.log("Hello World");
\`\`\`

> This is a blockquote
> It can span multiple lines

- Bulleted lists
- Are supported
- With multiple items

1. Numbered lists
2. Are also supported
3. And automatically numbered

[Links](https://example.com) work too!

---

Horizontal lines separate content.`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-3 w-3 mr-1" />
          Markdown supported
          {isOpen ? (
            <ChevronUp className="h-3 w-3 ml-1" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-1" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">
        <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
          <h4 className="text-sm font-medium mb-2">Markdown Quick Reference</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2">Markdown Input:</h5>
              <pre className="text-xs bg-background rounded border p-2 overflow-auto max-h-48">
                {exampleMarkdown}
              </pre>
            </div>
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2">Rendered Output:</h5>
              <div className="bg-background rounded border p-2 max-h-48 overflow-auto">
                <MarkdownRenderer 
                  content={exampleMarkdown} 
                  className="prose-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default MarkdownHelp;