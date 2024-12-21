export interface StrategyDrawerProps {
  strategy: string | null;
  onClose: () => void;
  stats: Record<string, { pass: number; total: number }>;
}

export const StrategyDrawer: React.FC<StrategyDrawerProps> = ({ strategy, onClose, stats }) => {
  // Drawer implementation
};
