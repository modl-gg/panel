import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'wouter';
import SearchBar from '@/components/knowledgebase/SearchBar';
import CategoryDisplay from '@/components/knowledgebase/CategoryDisplay';
import PageContainer from '@/components/layout/PageContainer';

// Mock types - replace with actual types from API
interface ArticleStub {
  id: string;
  title: string;
  slug: string;
  ordinal: number;
}

interface CategoryWithArticles {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ordinal: number;
  articles: ArticleStub[];
}

const KnowledgebasePage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryWithArticles[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ArticleStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/public/knowledgebase/categories');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setCategories(data);
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to load categories.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const handleSearch = async () => {
      try {
        const response = await fetch(`/api/public/knowledgebase/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSearchResults(data);
      } catch (e: any) {
        console.error('Search failed:', e);
        setSearchResults([]); // Clear results on error
      }
    };

    const debounceSearch = setTimeout(() => {
      handleSearch();
    }, 300); // Debounce search requests

    return () => clearTimeout(debounceSearch);
  }, [searchTerm]);

  if (isLoading) {
    return <PageContainer><p>Loading knowledgebase...</p></PageContainer>;
  }

  if (error) {
    return <PageContainer><p>Error loading knowledgebase: {error}</p></PageContainer>;
  }

  const contentToDisplay = searchTerm.trim().length >=2 ? searchResults : categories;

  return (
    <PageContainer>
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6 text-center">Knowledge Base</h1>
        
        <SearchBar searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />

        {searchTerm.trim().length >= 2 && searchResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Search Results</h2>
            {searchResults.map(article => (
              <div key={article.id} className="mb-2 p-3 border rounded hover:bg-gray-50">
                <Link href={`/article/${article.slug}`} className="text-blue-600 hover:underline">
                  {article.title}
                </Link>
                {/* Optionally show category: {article.category?.name} */}
              </div>
            ))}
          </div>
        )}

        {searchTerm.trim().length >= 2 && searchResults.length === 0 && (
            <p>No articles found for "{searchTerm}".</p>
        )}


        {!searchTerm && categories.length === 0 && (
          <p className="text-center text-gray-500">No categories available at the moment.</p>
        )}

        {!searchTerm && categories.map(category => (
          <CategoryDisplay
            key={category.id}
            id={category.id}
            name={category.name}
            slug={category.slug}
            description={category.description}
            articles={category.articles}
          />
        ))}
      </div>
    </PageContainer>
  );
};

export default KnowledgebasePage;