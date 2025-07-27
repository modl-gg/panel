import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Search, Shield, MessageCircle, Phone, UserPlus, FileText, ExternalLink, ChevronRight, BookOpen, ChevronDown, LogIn, Sun, Moon } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import { useTheme } from 'next-themes';
import serverLogo from '@/assets/server-logo.png';
import * as LucideIcons from 'lucide-react';
import { usePublicSettings } from '@/hooks/use-public-settings';

// Types for knowledgebase data
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

// Types for homepage cards
interface HomepageCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  icon_color?: string;
  action_type: 'url' | 'category_dropdown';
  action_url?: string;
  action_button_text?: string;
  background_color?: string;
  ordinal: number;
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    articles: ArticleStub[];
  };
}

const HomePage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryWithArticles[]>([]);
  const [homepageCards, setHomepageCards] = useState<HomepageCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ArticleStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { theme, setTheme } = useTheme();
  const { data: publicSettings } = usePublicSettings();

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/public/knowledgebase/categories');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setCategories(data);
      } catch (e: any) {
        console.error('Failed to load categories:', e);
        setCategories([]);
      }
    };

    fetchCategories();
  }, []);

  // Fetch homepage cards
  useEffect(() => {
    const fetchHomepageCards = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/public/homepage-cards');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setHomepageCards(data);
      } catch (e: any) {
        console.error('Failed to load homepage cards:', e);
        // Fallback to default cards if no custom cards are found
        setHomepageCards([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHomepageCards();
  }, []);

  // Handle search with debouncing
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const handleSearch = async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/public/knowledgebase/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSearchResults(data);
      } catch (e: any) {
        console.error('Search failed:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceSearch = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(debounceSearch);
  }, [searchTerm]);

  // Function to get the icon component from Lucide
  const getIconComponent = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent || BookOpen; // Fallback to BookOpen if icon not found
  };

  // Function to toggle expanded state for category dropdown cards
  const toggleExpanded = (cardId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  // Function to render a single homepage card
  const renderHomepageCard = (card: HomepageCard, index: number) => {
    const IconComponent = getIconComponent(card.icon);
    const isExpanded = expandedCards.has(card.id);
    const iconColor = card.icon_color || '#3b82f6'; // Default to blue if no color specified

    if (card.action_type === 'category_dropdown' && card.category) {
      return (
        <Card key={card.id} className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
          <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(card.id)}>
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="text-center">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                  <IconComponent className="h-7 w-7" style={{ color: iconColor }} />
                </div>
                <h3 className="font-medium text-lg mb-3">{card.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{card.description}</p>
              </div>
              
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <span>{card.category.articles.length} article{card.category.articles.length !== 1 ? 's' : ''}</span>
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </CardContent>
          </Collapsible>
        </Card>
      );
    } else {
      // URL action type
      const buttonText = card.action_button_text || 'Learn More';
      const url = card.action_url || '#';
      
      return (
        <Card key={card.id} className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
          <CardContent className="p-6 h-full flex flex-col justify-between">
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <IconComponent className="h-7 w-7" style={{ color: iconColor }} />
              </div>
              <h3 className="font-medium text-lg mb-3">{card.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{card.description}</p>
            </div>
            {url.startsWith('/') ? (
              <Link href={url}>
                <Button variant="outline" size="sm" className="w-full">
                  {buttonText}
                </Button>
              </Link>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => window.open(url, '_blank')}
              >
                {buttonText}
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }
  };

  // Show all categories instead of just first 4
  const allCategories = categories;

  return (
    <div className="min-h-screen bg-background">{/* Removed gradient for better theme compatibility */}
      {/* Header with Sign In and Theme Toggle - positioned at 3/4 from left edge */}
      <div className="absolute top-6 left-3/4 z-10 flex items-center gap-2">
        {/* Theme Toggle */}
        <Button 
          variant="secondary" 
          size="sm" 
          className="bg-card/80 hover:bg-card/90 text-foreground border-muted"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Sign In Button */}
        <Link href="/panel/auth">
          <Button variant="secondary" size="sm" className="bg-card/80 hover:bg-card/90 text-foreground border-muted">
            <LogIn className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </Link>
      </div>

      {/* Logo and Search Section */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          {/* Large Logo */}
          <div className="w-32 h-32 mx-auto mb-6">
            <img 
              src={publicSettings?.homepageIconUrl || serverLogo} 
              alt={publicSettings?.serverDisplayName || "Server Logo"} 
              className="w-full h-full object-contain" 
            />
          </div>
          
          {/* Descriptive Text */}
          <p className="text-foreground text-lg mb-8">Search our knowledgebase or contact us here</p>
          
          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search knowledgebase..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 py-3 rounded-full border-2 focus:border-primary shadow-md"
              />
            </div>
            
            {/* Search Results */}
            {searchTerm.trim().length >= 2 && (
              <Card className="mt-3 text-left max-h-48 overflow-y-auto">
                <CardContent className="p-3">
                  {isSearching ? (
                    <p className="text-center text-muted-foreground text-sm">Searching...</p>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map(article => (
                        <Link key={article.id} href={`/article/${article.slug}`}>
                          <div className="p-2 rounded hover:bg-muted/50 transition-colors cursor-pointer">
                            <p className="text-sm font-medium text-foreground hover:underline">{article.title}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm">
                      No articles found for "{searchTerm}"
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Quick Actions - Moved closer to search */}
          <div className="max-w-6xl mx-auto mt-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 auto-rows-max">
              {isLoading ? (
                // Loading skeleton
                [...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse h-72">
                    <CardContent className="p-6 h-full flex flex-col">
                      <div className="w-14 h-14 bg-muted rounded-full mx-auto mb-4"></div>
                      <div className="h-6 bg-muted rounded w-3/4 mx-auto mb-3"></div>
                      <div className="h-4 bg-muted rounded w-full mb-2"></div>
                      <div className="h-4 bg-muted rounded w-2/3 mx-auto mb-4"></div>
                      <div className="h-8 bg-muted rounded w-full mt-auto"></div>
                    </CardContent>
                  </Card>
                ))
              ) : homepageCards.length > 0 ? (
                homepageCards.map((card, index) => renderHomepageCard(card, index))
              ) : (
                // Fallback to default cards if no custom cards are configured
                <>
                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-500/20 transition-colors">
                          <Shield className="h-7 w-7 text-amber-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">Appeal Punishment</h3>
                        <p className="text-sm text-muted-foreground mb-4">Submit an appeal if you believe you were unfairly banned or punished</p>
                      </div>
                      <Link href="/appeal">
                        <Button variant="outline" size="sm" className="w-full">
                          Submit Appeal
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>

                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                          <UserPlus className="h-7 w-7 text-blue-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">Apply for Staff</h3>
                        <p className="text-sm text-muted-foreground mb-4">Join our staff team and help manage the community</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full">
                        Apply Now
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-green-500/20 transition-colors">
                          <MessageCircle className="h-7 w-7 text-green-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">Contact Us</h3>
                        <p className="text-sm text-muted-foreground mb-4">Get help from our support team for any issues</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full">
                        Contact Support
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-500/20 transition-colors">
                          <BookOpen className="h-7 w-7 text-purple-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">Rules & Policies</h3>
                        <p className="text-sm text-muted-foreground mb-4">Browse server rules, community guidelines, and policies</p>
                      </div>
                      <Link href="/knowledgebase?category=rules-policies">
                        <Button variant="outline" size="sm" className="w-full">
                          View Rules
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>

                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-orange-500/20 transition-colors">
                          <Search className="h-7 w-7 text-orange-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">Guides & Troubleshooting</h3>
                        <p className="text-sm text-muted-foreground mb-4">Find helpful guides and troubleshooting resources</p>
                      </div>
                      <Link href="/knowledgebase?category=guides-troubleshooting">
                        <Button variant="outline" size="sm" className="w-full">
                          View Guides
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>

                  <Card className="group hover:shadow-md transition-all duration-300 hover:-translate-y-1 h-72">
                    <CardContent className="p-6 h-full flex flex-col justify-between">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-500/20 transition-colors">
                          <FileText className="h-7 w-7 text-indigo-600" />
                        </div>
                        <h3 className="font-medium text-lg mb-3">News & Updates</h3>
                        <p className="text-sm text-muted-foreground mb-4">Stay up to date with the latest announcements and changes</p>
                      </div>
                      <Link href="/knowledgebase?category=news-updates">
                        <Button variant="outline" size="sm" className="w-full">
                          View News
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Expanded Category Article Sections - Rendered separately below the grid */}
            <div className="mt-6 space-y-4">
              {homepageCards.length > 0 ? (
                homepageCards
                  .filter(card => card.action_type === 'category_dropdown' && card.category && expandedCards.has(card.id))
                  .map(card => {
                    const IconComponent = getIconComponent(card.icon);
                    const iconColor = card.icon_color || '#3b82f6';
                    
                    return (
                      <Card key={`expanded-${card.id}`} className="bg-muted/20 border-2 border-dashed border-primary/20">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <IconComponent className="h-5 w-5" style={{ color: iconColor }} />
                            {card.category!.name} Articles
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {card.category!.articles.map(article => (
                              <Link key={article.id} href={`/article/${article.slug}`}>
                                <div className="p-3 rounded-lg border border-border/50 hover:shadow-md hover:border-border transition-all duration-200 hover:bg-muted/30 cursor-pointer bg-background/50">
                                  <div className="flex items-center gap-3">
                                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground hover:underline truncate">{article.title}</p>
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                          {card.category!.articles.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>No articles available in this category yet.</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;