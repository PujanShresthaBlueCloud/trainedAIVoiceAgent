"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Database,
  PhoneCall,
  PhoneOutgoing,
  Phone,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Bell,
  CreditCard,
  Settings,
  Zap,
  Sun,
  Moon,
  HelpCircle,
  Megaphone,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { UserButton, useClerk, useUser } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "BUILD",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/knowledge-base", label: "Knowledge Base", icon: Database },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { href: "/phone-numbers", label: "Phone Numbers", icon: PhoneCall },
      { href: "/batch-call", label: "Batch Call", icon: PhoneOutgoing },
    ],
  },
  {
    label: "MONITOR",
    items: [
      { href: "/calls", label: "Call History", icon: Phone },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/alerting", label: "Alerting", icon: Bell, badge: "New" },
    ],
  },
  {
    label: "COMPLIANCE",
    items: [
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
    ],
  },
];

function UserEmail() {
  const { user } = useUser();
  if (!user) return null;
  return (
    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
      {user.primaryEmailAddress?.emailAddress}
    </p>
  );
}

function SignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      onClick={() => signOut({ redirectUrl: "/sign-in" })}
      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors flex-shrink-0"
      title="Sign out"
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <Link href="/agents" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">TrainedLogic</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Workspace</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-500 font-medium">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Megaphone className="w-4 h-4" />
          Updates
        </button>
        <div className="px-3 pt-2 flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <UserButton afterSignOutUrl="/sign-in" />
            <UserEmail />
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
