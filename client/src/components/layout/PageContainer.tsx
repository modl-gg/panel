import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  title?: string;
}

const PageContainer = ({ children, title }: PageContainerProps) => {
  // Responsive container that adapts to mobile devices
  return (
    <section className="transition-all duration-300 bg-card shadow-card rounded-card-lg border-transparent dark:border dark:border-border/20
      md:p-8 md:my-6 md:mx-8
      p-4 my-0 mx-0">
      {title && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
};

export default PageContainer;