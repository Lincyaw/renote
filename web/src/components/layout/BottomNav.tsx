import type { TabId } from './AppShell';
import TabIcon from '../icons/TabIcon';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

interface BottomNavProps {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function BottomNav({ tabs, activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="flex bg-gray-900 border-t border-gray-800 safe-area-pb">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
              isActive ? 'text-blue-400' : 'text-gray-500'
            }`}
          >
            <TabIcon tabId={tab.id} active={isActive} size={20} />
            <span className="text-[10px]">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
