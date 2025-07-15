import React from 'react';
import ReactMarkdown from 'react-markdown';

interface ArticleDisplayProps {
  title: string;
  content: string;
  updatedAt: string; // ISO date string
}

const ArticleDisplay: React.FC<ArticleDisplayProps> = ({ title, content, updatedAt }) => {
  return (
    <article className="prose lg:prose-xl max-w-none bg-card p-6 rounded-lg shadow prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-li:text-foreground prose-blockquote:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground dark:prose-invert">
      <h1 className="text-3xl font-bold mb-4 text-foreground">{title}</h1>
      <div className="text-sm text-muted-foreground mb-4">
        <span>Last updated: {new Date(updatedAt).toLocaleDateString()}</span>
      </div>
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
};

export default ArticleDisplay;