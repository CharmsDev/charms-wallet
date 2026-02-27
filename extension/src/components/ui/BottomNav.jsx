import { HomeIcon, AssetsIcon, ActivityIcon, SettingsIcon } from './NavIcons';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'assets', label: 'Assets', Icon: AssetsIcon },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function BottomNav({ activeScreen, onNavigate }) {
  return (
    <nav className="glass-effect border-t border-dark-700 px-2 py-1 safe-area-bottom">
      <div className="flex justify-around">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
              activeScreen === id ? 'bg-dark-800' : 'hover:bg-dark-800/50'
            }`}
          >
            <Icon active={activeScreen === id} />
            <span className={`text-xs mt-1 ${activeScreen === id ? 'text-primary-400' : 'text-dark-500'}`}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
