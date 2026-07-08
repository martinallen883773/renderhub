interface PageHeaderProps {
  title: string;
  description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-lg">{description}</p>
    </div>
  );
}
