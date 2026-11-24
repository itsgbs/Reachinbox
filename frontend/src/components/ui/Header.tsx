'use client';

import Image from 'next/image';
import { LogOut, Mail, ExternalLink, Settings } from 'lucide-react';
import { User, SlackStatus } from '@/types';
import SlackButton from './SlackButton';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  slackStatus: SlackStatus;
  onSlackChange: (status: SlackStatus) => void;
}

export default function Header({ user, onLogout, slackStatus, onSlackChange }: HeaderProps) {
  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500/20 rounded-lg flex items-center justify-center border border-brand-500/30">
            <Mail className="w-4 h-4 text-brand-500" />
          </div>
          <span className="font-semibold text-white">ReachInbox Scheduler</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* BullMQ Board link */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/admin/queues`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Queue Dashboard
          </a>

          <div className="w-px h-5 bg-surface-border" />

          {/* Slack */}
          <SlackButton status={slackStatus} onChange={onSlackChange} />

          <div className="w-px h-5 bg-surface-border" />

          {/* User */}
          <div className="flex items-center gap-2">
            {user.avatar ? (
              <Image
                src={user.avatar}
                alt={user.name}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="w-8 h-8 bg-brand-500/20 rounded-full flex items-center justify-center text-brand-400 text-sm font-medium">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-white leading-tight">{user.name}</p>
              <p className="text-xs text-gray-400 leading-tight">{user.email}</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-surface-hover"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
