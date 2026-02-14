interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
      <div className="text-gray-600 mb-1">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-300">{title}</h3>
      <p className="text-sm text-gray-500 text-center max-w-xs">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex gap-2 mt-2">
          {action && (
            <button
              onClick={action.onClick}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
                action.variant === 'secondary'
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
