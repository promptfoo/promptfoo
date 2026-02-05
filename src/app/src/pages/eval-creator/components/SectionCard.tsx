import { Badge } from '@app/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/components/ui/card';

interface SectionCardProps {
  title: string;
  description: string;
  count?: number;
  required?: boolean;
  isEmpty?: boolean;
  guidance?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  count,
  required,
  isEmpty,
  guidance,
  children,
}: SectionCardProps) {
  return (
    <Card className="bg-white dark:bg-zinc-900 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{title}</CardTitle>
              {required && isEmpty && (
                <Badge variant="warning" className="text-xs">
                  Required
                </Badge>
              )}
              {count !== undefined && count > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {count} configured
                </Badge>
              )}
            </div>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>
        {guidance && <div className="mt-4">{guidance}</div>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
