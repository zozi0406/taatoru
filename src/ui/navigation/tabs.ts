export const TAB_ITEMS = [
  {
    route: 'index',
    label: 'Home',
    sf: { default: 'house', selected: 'house.fill' },
    md: 'home',
  },
  {
    route: 'search',
    label: 'Search',
    sf: 'magnifyingglass',
    md: 'search',
  },
  {
    route: 'analytics',
    label: 'Analytics',
    sf: { default: 'chart.bar', selected: 'chart.bar.fill' },
    md: 'bar_chart',
  },
  {
    route: 'settings',
    label: 'Settings',
    sf: { default: 'gearshape', selected: 'gearshape.fill' },
    md: 'settings',
  },
] as const;
