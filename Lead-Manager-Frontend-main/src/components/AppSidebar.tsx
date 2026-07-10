// src/components/AppSidebar.tsx
import { Home, Users, UserPlus, Upload, BarChart3, User, FileText, Database, LogIn } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { getRoleFromStorage } from '@/services/authService';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

type Item = { title: string; url: string; icon: React.ComponentType<any> };

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const role = getRoleFromStorage(); // 1 = telecaller, 2 = admin, null = not logged in
  const isCollapsed = state === 'collapsed';
  const isAdmin = role === 2;
  const isTele = role === 1;

  const adminItems: Item[] = [
    { title: 'Dashboard',     url: '/admin',             icon: Home },
    { title: 'Telecallers',   url: '/admin/telecallers', icon: Users },
    { title: 'Admins',        url: '/admin/admins',      icon: UserPlus },
    { title: 'Leads',         url: '/admin/leads',       icon: Database },
    { title: 'Distribution',  url: '/admin/distribution',icon: FileText },
    { title: 'Reports',       url: '/admin/reports',     icon: BarChart3 },
    { title: 'Profile',       url: '/admin/profile',     icon: User },
  ];

  const telecallerItems: Item[] = [
    { title: 'Dashboard', url: '/telecaller',           icon: Home },
    { title: 'Clients',   url: '/telecaller/clients',   icon: Users },
    { title: 'Leads',     url: '/telecaller/leads',     icon: Database }, // ✅ ADDED
    { title: 'Reports',   url: '/telecaller/reports',   icon: BarChart3 },
    { title: 'Profile',   url: '/telecaller/profile',   icon: User },
  ];

  const guestItems: Item[] = [
    { title: 'Login', url: '/login', icon: LogIn },
  ];

  const items: Item[] = isAdmin ? adminItems : isTele ? telecallerItems : guestItems;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Brand */}
        <div className="px-4 py-6">
          <h2
            className={`font-bold text-sidebar-primary-foreground transition-all ${
              isCollapsed ? 'text-center text-xl' : 'text-2xl'
            }`}
          >
            {isCollapsed ? 'LM' : 'Lead Manager'}
          </h2>
          {!isCollapsed && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin ? 'Admin' : isTele ? 'Telecaller' : 'Guest'}
            </p>
          )}
        </div>

        {/* Menu */}
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;
