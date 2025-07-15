import React from 'react';
import { Input } from 'modl-shared-web/components/ui/input'; // Assuming you have a general Input component

interface SearchBarProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchTerm,
  onSearchTermChange,
  placeholder = "Search articles...",
}) => {
  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={searchTerm}
      onChange={(e) => onSearchTermChange(e.target.value)}
      className="w-full p-3 mb-8 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
    />
  );
};

export default SearchBar;