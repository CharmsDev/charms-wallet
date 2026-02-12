// Extension-compatible implementation of next/navigation
// Uses the existing NavigationContext from the wallet for real navigation

import { useNavigation } from '@/contexts/NavigationContext';

// Maps URL paths to navigation sections
const pathToSection = {
  '/': 'wallets',
  '/wallet': 'wallets',
  '/charms': 'charms',
  '/settings': 'settings',
  '/utxos': 'utxos',
};

export function useRouter() {
  const { setActiveSection } = useNavigation();
  
  return {
    push: (path) => {
      const section = pathToSection[path] || 'wallets';
      setActiveSection(section);
    },
    replace: (path) => {
      const section = pathToSection[path] || 'wallets';
      setActiveSection(section);
    },
    back: () => setActiveSection('wallets'),
    forward: () => {},
    refresh: () => window.location.reload(),
    prefetch: () => Promise.resolve(),
  };
}

export function usePathname() {
  const { activeSection } = useNavigation();
  return '/' + (activeSection === 'wallets' ? '' : activeSection);
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function useParams() {
  return {};
}

export function redirect(path) {
  const section = pathToSection[path] || 'wallets';
  // This will be called outside component, so we can't use hooks
  console.warn('[Extension] redirect called to:', path);
}

export function notFound() {
  console.warn('[Extension] notFound called');
}
