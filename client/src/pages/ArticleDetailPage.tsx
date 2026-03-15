import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    return <PageContainer><p>{t('article.loading')}</p></PageContainer>;
  }

  if (error) {
    return <PageContainer><p>{t('article.error', { message: error })}</p></PageContainer>;
  }

  if (!article) {
    return <PageContainer><p>{t('article.notFound')}</p></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <Link href="/" className="text-primary hover:underline">&larr; {t('article.backToHome')}</Link>
          {article.category && (
            <span className="ml-2 text-muted-foreground">
              {t('article.in')} <Link href={`/#${article.category.slug}`} className="text-primary hover:underline">{article.category.name}</Link>
            </span>
          )}
        </div>

        <article className="prose lg:prose-xl max-w-none bg-card p-6 rounded-lg shadow prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-li:text-foreground prose-blockquote:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground dark:prose-invert">
          <h1 className="text-3xl font-bold mb-4 text-foreground">{article.title}</h1>
          <div className="text-sm text-muted-foreground mb-4">
            <span>{t('article.lastUpdated')}: {new Date(article.updatedAt).toLocaleDateString()}</span>
          </div>
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </article>
      </div>
    </PageContainer>
  );
};

export default ArticleDetailPage;
