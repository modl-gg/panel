import React from 'react';
import { Link } from 'react-router-dom';

interface ArticleStub {
  id: string;
  title: string;
  slug: string;
}

interface CategoryDisplayProps {
  id: string;
  name: string;
  slug: string;
  description?: string;
  articles: ArticleStub[];
}

const CategoryDisplay: React.FC<CategoryDisplayProps> = ({ name, description, articles, slug }) => {
  return (
    <div className="mb-8 p-4 border rounded-lg shadow">
      <h2 id={slug} className="text-2xl font-semibold mb-4 text-gray-800">{name}</h2>
      {description && <p className="text-gray-600 mb-3">{description}</p>}
      {articles && articles.length > 0 ? (
        <ul className="list-disc pl-5 space-y-1">
          {articles.map(article => (
            <li key={article.id}>
              <Link to={`/kb/${article.slug}`} className="text-blue-600 hover:underline hover:text-blue-800">
                {article.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No articles in this category yet.</p>
      )}
    </div>
  );
};

export default CategoryDisplay;