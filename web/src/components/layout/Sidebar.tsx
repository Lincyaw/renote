import type { TabId } from './AppShell';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

interface SidebarProps {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  collapsed?: boolean;
}

export default function Sidebar({ tabs, activeTab, onTabChange, collapsed }: SidebarProps) {
  return (
    <div className={`flex flex-col bg-gray-900 border-r border-gray-800 ${collapsed ? 'w-16' : 'w-48'} transition-all`}>
      <div className={`py-4 ${collapsed ? 'px-2' : 'px-4'} border-b border-gray-800`}>
        <h1 className={`font-bold text-blue-400 ${collapsed ? 'text-center text-xs' : 'text-lg'}`}>
          {collapsed ? 'R' : 'Renote'}
        </h1>
      </div>

      <nav className="flex-1 py-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2 py-3' : 'px-4 py-2.5'} text-sm transition-colors ${
                isActive
                  ? 'bg-gray-800 text-blue-400 border-r-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <span className="font-mono text-xs w-6 text-center shrink-0">{tab.icon}</span>
              {!collapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`py-3 ${collapsed ? 'px-2' : 'px-4'} border-t border-gray-800`}>
        <div className={`text-xs text-gray-600 ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? 'v1' : 'Renote Web v1.0'}
        </div>
      </div>
    </div>
  );
}
