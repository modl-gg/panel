import React, { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter'; // Changed from react-router-dom to wouter
import ReactMarkdown from 'react-markdown';
import PageContainer from '@/components/layout/PageContainer'; // Corrected import
// import { Button } from '@modl-gg/shared-web/components/ui/button'; // If you want a back button

// Mock type - replace with actual type from API
interface ArticleDetail {
  id: string;
  title: string;
  slug: string;
  content: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: string;
  updatedAt: string;
}

const ArticleDetailPage: React.FC = () => {
  const [, params] = useRoute("/article/:articleSlug");
  const articleSlug = params?.articleSlug;
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArticle = async () => {
      if (!articleSlug) return;
      setIsLoading(true);
      try {
        const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
        const response = await fetch(getApiUrl(`/v1/public/knowledgebase/articles/${articleSlug}`), {
          credentials: 'include',
          headers: { 'X-Server-Domain': getCurrentDomain() }
        });
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Article not found.');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setArticle(data);
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to load article.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticle();
  }, [articleSlug]);

  if (isLoading) {
    return <PageContainer><p>Loading article...</p></PageContainer>;
  }

  if (error) {
    return <PageContainer><p>Error: {error}</p></PageContainer>;
  }

  if (!article) {
    return <PageContainer><p>Article not found.</p></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <Link href="/" className="text-primary hover:underline">&larr; Back to Home</Link>
          {article.category && (
            <span className="ml-2 text-muted-foreground">
              in <Link href={`/#${article.category.slug}`} className="text-primary hover:underline">{article.category.name}</Link> {/* Assuming category slug can be a hash on the main KB page */}
            </span>
          )}
        </div>

        <article className="prose lg:prose-xl max-w-none bg-card p-6 rounded-lg shadow prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-li:text-foreground prose-blockquote:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground dark:prose-invert">
          <h1 className="text-3xl font-bold mb-4 text-foreground">{article.title}</h1>
          <div className="text-sm text-muted-foreground mb-4">
            <span>Last updated: {new Date(article.updatedAt).toLocaleDateString()}</span>
          </div>
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </article>
      </div>
    </PageContainer>
  );
};

export default ArticleDetailPage;
