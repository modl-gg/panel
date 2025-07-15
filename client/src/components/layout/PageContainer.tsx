import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  title?: string;
}

const PageContainer = ({ children, title }: PageContainerProps) => {
  // Responsive container that adapts to mobile devices
  return (
    <section className="transition-all duration-300 bg-background/50 border rounded-xl shadow-sm
      md:p-8 md:my-8 md:mx-8
      p-4 my-0 mx-0">
      {title && (
        <div className="flex justify-between items-center mb-4 md:mb-8">
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
      )}
      <div className="flex flex-col space-y-6 md:space-y-10">
        {children}
      </div>
    </section>
  );
};

export default PageContainer;