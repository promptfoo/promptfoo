import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { cn } from '@app/lib/utils';
import {
  BookOpen,
  Briefcase,
  Bug,
  Calendar,
  ExternalLink,
  Github,
  MessageCircle,
} from 'lucide-react';

const links: { icon: React.ReactElement; text: string; href: string }[] = [
  {
    icon: <BookOpen className="size-4" />,
    text: 'Documentation',
    href: 'https://www.promptfoo.dev/docs/intro',
  },
  {
    icon: <Github className="size-4" />,
    text: 'GitHub Repository',
    href: 'https://github.com/promptfoo/promptfoo',
  },
  {
    icon: <Bug className="size-4" />,
    text: 'File an Issue',
    href: 'https://github.com/promptfoo/promptfoo/issues',
  },
  {
    icon: <MessageCircle className="size-4" />,
    text: 'Join Our Discord Community',
    href: 'https://discord.gg/promptfoo',
  },
  {
    icon: <Calendar className="size-4" />,
    text: 'Book a Meeting',
    href: 'https://cal.com/team/promptfoo/intro2',
  },
  {
    icon: <Briefcase className="size-4" />,
    text: 'Careers',
    href: 'https://www.promptfoo.dev/careers/',
  },
];

export default function InfoModal<T extends { open: boolean; onClose: () => void }>({
  open,
  onClose,
}: T) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>About Promptfoo</DialogTitle>
          <a
            href="https://github.com/promptfoo/promptfoo/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Version {import.meta.env.VITE_PROMPTFOO_VERSION}
          </a>
        </DialogHeader>
        <DialogDescription>
          Promptfoo is a MIT licensed open-source tool for evaluating and red-teaming LLMs. We make
          it easy to track the performance of your models and prompts over time with automated
          support for dataset generation and grading.
        </DialogDescription>
        <div className="flex flex-col gap-3 mt-2">
          {links.map((item, index) => (
            <a
              key={index}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 text-sm text-foreground',
                'hover:text-primary transition-colors',
              )}
            >
              {item.icon}
              <span>{item.text}</span>
              <ExternalLink className="size-3 opacity-50 ml-auto" />
            </a>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
