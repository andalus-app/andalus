import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useScrollHide } from '../hooks/useScrollHide';
import SettingsScreen from './SettingsScreen';
import AboutScreen from './AboutScreen';
import EbooksScreen from './EbooksScreen';
import BookingScreen from './BookingScreen';
import AsmaulHusnaScreen from './AsmaulHusnaScreen';
import AboutIcon from '../icons/about-svgrepo-com.svg';
import CharityIcon from '../icons/charity-svgrepo-com.svg';
import SwishLogo from '../icons/swish-logo.svg';
import BankgirotLogo from '../icons/bankgirot-logo.svg';

const MENU_ITEMS = [
  {
    id: 'asmaul-husna',
    label: 'Allahs 99 namn',
    sublabel: 'أسماء الله الحسنى',
    svgIcon: (accent) => (
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" width="38" height="28">
        <path fill={accent} d="M317.8,208c0-19.9-5.8-42.7-17.5-68.5-10.5-23.1-23.5-44.3-39.2-63.5-.4-.5-9-12.1-25.7-34.9-1.2-1.6-3.3-4-6.3-6.9-2.1-2.2-3.2-3.6-3.2-4.3V7.1c0-2.3.6-3.4,1.7-3.4s1.3.4,2.2,1.1l41.4,35.2c2.5,2.1,3.8,3.8,3.8,4.9s-.7,1.1-1.9,1.1-4.9-.8-9.1-2.5c-3.2-1.2-4.8-1.4-4.8-.7s.6,1.1,1.7,2.3c18.1,18.1,33.2,39.6,45.2,64.4,13.6,28.1,20.4,55.3,20.4,81.8s-6.1,47.7-18.3,64.9c-9.5,13.4-20.3,22.9-32.5,28.4-4.8,2.2-13,4.9-24.6,7.9-11.6,3-20.1,4.8-25.6,5.3-2.2.2-3.3,0-3.3-.6s1.1-1.5,3.2-3c10.6-5.9,27.8-16.3,51.8-31,27.1-17.6,40.7-36,40.7-55.2Z"/>
        <path fill={accent} d="M263.1,180.1c-4-12.3-6.8-23.7-8.2-34.4-.5-4.1-.9-6.6-1.2-7.6-.6-2.2-1.6-4.4-3.2-6.6,1.1-3.7,2.9-8.8,5.2-15.4.8-1.9,1.5-2.9,2.1-2.9s1.5.9,3,2.9c6.3,8.8,11.6,16.6,15.8,23.5,1.8,2.9,2.6,4.9,2.6,6.1s-.4,1.3-1.2,1.3c-1.6,0-4.4-1.3-8.6-3.9-.4,0-.7.3-1,.8,1.5,5.2,3.7,12.3,6.9,21.3,7.2,20.4,10.8,35.2,10.8,44.5s-1.4,17.4-4.2,24.3c-4.6,11.8-12.6,17.7-24,17.7s-21.6-5.3-28.6-15.7c-4.2-6.3-8-15.7-11.2-28.3-1.4,12.7-5.4,23.5-12,32.7-8.1,11.1-18.5,16.6-31.1,16.6s-23.7-6.6-29.3-20c-3.1-7.5-4.6-16.2-4.6-26.3s1.6-25.8,4.7-37.3c.8-3.1,1.3-5.2,1.3-6.2s-.1-.8-.4-.8c-.6,0-1.9,1.5-3.8,4.6-3.1,4.9-6.4,14.7-9.8,29.6-4.4,19.2-7.3,30.7-8.7,34.7-1.8,5.5-4.4,9.9-7.7,13.3-2.7,2.8-5.1,4.2-7,4.2-8.9,0-15.8-5.7-20.6-17-4-9.4-5.9-20.7-5.9-34s1.4-19.4,4.3-30.3c.7-2.5,1.3-4.3,1.9-5.5.8-1.5,1.5-1.7,1.8-.6.3,1.3.2,3.5-.5,6.8-1.6,8.3-2.4,15.9-2.4,22.8,0,26.9,5.6,40.3,16.9,40.3s8.9-3.7,12.1-10.9c2-4.5,4.4-13.2,7.3-25.9,3.3-14.1,6.1-24.4,8.4-30.9,2.6-7.5,5.9-14.1,9.8-19.9,4.2-6.5,7.9-9.8,10.9-9.8s3.8,2.7,3.8,8.1-1.3,13.5-3.8,27.1c-2.5,13.7-3.8,22.8-3.8,27.5,0,10.2,2.1,18.1,6.4,23.8,4.2,5.8,10.2,8.6,17.7,8.6,13.7,0,24-4.3,30.8-12.9,5.4-6.8,8.1-15.1,8.1-25.1s-.8-18.8-2.4-27.7c-1.1-6.3-2.6-12.3-4.5-17.9-1.6-4.9-2.4-7.3-2.4-6.9,0-5.4,1.8-12.9,5.4-22.4.8-2.1,1.4-3.1,1.9-3.1s1.5,1.4,2.7,4c5.1,10.6,9.1,26.8,12.1,48.7,2.8,20.4,6.8,35,12,43.8,5.2,8.8,13.1,13.2,23.8,13.2s14.7-3.3,17.5-9.7c0-2.2-1.8-7-5.6-14.3-4.8-9.3-8.1-16.9-10.2-22.9Z"/>
        <path fill={accent} d="M176.7,51.6c-.4,2-.8,3.1-1.5,3.3-.8.2-1.2-1-1.2-3.5s-.4-5-1.2-8.3c-2.5-10.9-11.1-20.3-25.8-28.2-.9-.5-1.2-1.4-.9-2.5l2-7c.2-.6.7-.7,1.5-.3,14.1,6.2,22.9,16.9,26.4,32.3,1.1,4.8,1.3,9.5.6,14.2Z"/>
        <path fill={accent} d="M216.4,94.3c0,3.1-.7,6.3-2.1,9.7-1.8,4.3-4.1,6.5-7,6.5-4.5,0-7.7-3.1-9.6-9.3-2.2,8-6.1,12-11.8,12s-4-1.1-5.6-3.3c-1.9-2.6-2.7-5.9-2.7-10v-9.8c0-.8-.6-1.4-1.6-1.7-1.1-.3-1.6-1.1-1.6-2.5,0-2.2.9-4.3,2.7-6.3,1.7-1.8,2.9-2.7,3.8-2.7s1.7,2.2,1.7,6.4-.2,4.1-.6,5.6c-.4,1.5-.5,2.8-.5,3.9,0,2.3.4,4.6,1.4,6.7,1.1,2.5,2.5,3.7,4.2,3.7s4.2-1,6.1-3c1.9-1.9,2.8-4.2,2.8-6.9s-.4-4.1-1.3-7.7c-.9-3.7-1.3-5.9-1.3-6.8s.4-2.1,1.2-3.8c.8-1.7,1.4-2.6,1.8-2.6.7,0,1.7,2.4,2.8,7.3,1.1,4.8,1.8,8.4,1.8,10.7,0,6.7,2.5,10,7.7,10s3.6-1.1,4.2-3.3c-4.5-7.8-6.7-13.8-6.7-17.9s.6-4.5,1.8-6.3c.8-1.3,1.4-2,1.7-2,.4,0,.6.8.7,2.4.2,2.2.6,4,1.1,5.5,0,.1,1.1,2.9,3.2,8.2,1.3,3.2,1.9,5.6,1.9,7.3Z"/>
        <path fill={accent} d="M143.3,73.3c22.1-8,45.6-16.6,70.4-25.7,1.2-.4,2-.6,2.2-.4.3.2.3.9-.2,2-1.5,3.5-2.6,5.6-3.5,6.3-20.8,7.5-45.2,17-73,28.6.8-3.3,2.2-6.9,4-10.8Z"/>
        <path fill={accent} d="M136.5,257.8c0,2.9-1.2,6.2-3.6,10-2.5,3.9-5.7,7.2-9.5,9.9-1.5,1.1-2.5,1.7-2.8,1.7s0,0,0,0c0-.3.7-1.1,1.9-2.5,6.4-7,9.6-11.7,9.6-14s-1-3.3-3.1-3.3-2.2.3-3.1.9c-.7.4-1.1.7-1.3.8,0,0-.3-.2-.4-.2,0-.3.2-.8.4-1.8,1-4.8,3.4-7.2,7.2-7.2s4.8,2,4.8,5.9Z"/>
        <path fill={accent} d="M246.1,85.6c0,2.9-1.2,6.3-3.6,10-2.5,3.9-5.7,7.2-9.5,9.9-1.5,1.1-2.5,1.7-2.8,1.7s0,0,0,0c0-.3.7-1.1,1.9-2.5,6.4-7,9.6-11.7,9.6-14s-1.1-3.4-3.1-3.4-2.2.3-3.1.9c-.7.4-1.1.7-1.3.7,0,0-.3-.2-.4-.2,0-.3.2-.8.4-1.8,1.1-4.8,3.4-7.2,7.2-7.2s4.8,2,4.8,5.9Z"/>
        <path fill={accent} d="M167.2,178.8c3.2,0,6.1,1.9,8.6,5.7,2.5,3.8,4.4,8.8,5.4,14.9.1.6.2,1,.2,1.1.1.2.2.2.3,0,0,0,.2-.5.4-1.1.5-3.6,1.8-9.1,3.8-16.4,2.2-5.2,4.5-7.8,7.1-7.8s2.6.9,3.9,2.6c1.2,1.5,1.8,2.8,1.8,3.8s-.2,1.7-.6,2.9c-.5,1.6-1.1,2.4-1.8,2.4s-.9-.6-1.9-1.9c-1-1.2-2-1.8-3-1.8-2.3,0-4.4,5.4-6.4,16.2-.8,4.7-1.8,8-2.8,10-.8,1.3-1.4,2-1.9,2s-.7-.6-.7-1.8c0-1.9-1.1-5.6-3.3-11-2.2-5.4-3.7-8.2-4.6-8.2s-1.1.2-1.2.6c-.2.4-.7.6-1.5.6s-2.2-.7-3.8-2.1c-1.5-1.5-2.3-2.6-2.3-3.4s.7-1.7,1.9-3.9c1.3-2.2,2.2-3.3,2.5-3.3Z"/>
        <path fill={accent} d="M223,262c0,2.9-1.2,6.2-3.6,10-2.5,3.9-5.7,7.2-9.5,9.9-1.5,1.1-2.5,1.7-2.8,1.7s0,0,0,0c0-.3.7-1.1,1.9-2.5,6.4-7,9.6-11.7,9.6-14s-1.1-3.3-3.1-3.3-2.1.3-3.1.9c-.7.4-1.1.7-1.3.7,0,0-.3-.2-.4-.2,0-.3.2-.8.4-1.8,1.1-4.8,3.4-7.2,7.2-7.2s4.7,2,4.7,5.9Z"/>
        <path fill={accent} d="M164.8,265.7c2.2,0,4,1.3,5.8,3.8,1.7,2.5,2.9,5.8,3.6,9.9,0,.4.1.7.1.7,0,.1.1.1.2,0,0,0,.1-.3.3-.7.4-2.4,1.2-6.1,2.5-10.9,1.5-3.5,3-5.2,4.8-5.2s1.8.6,2.6,1.8c.7,1,1.1,1.8,1.1,2.5s-.1,1.1-.4,1.9c-.3,1.1-.7,1.6-1.2,1.6s-.6-.4-1.2-1.2c-.7-.8-1.3-1.2-2-1.2-1.5,0-2.9,3.6-4.2,10.8-.6,3.1-1.2,5.3-1.9,6.6-.5.9-.9,1.3-1.3,1.3s-.4-.4-.4-1.2c0-1.2-.7-3.7-2.2-7.3-1.5-3.7-2.5-5.5-3.1-5.5s-.7.1-.8.4c-.1.3-.5.4-1.1.4s-1.5-.5-2.6-1.5c-1-1-1.5-1.7-1.5-2.3s.4-1.1,1.3-2.6c.9-1.5,1.4-2.2,1.6-2.2Z"/>
        <path fill={accent} d="M147.2,123c-1.3-3.8-3.8-6.7-7.5-8.8-.4,3.5-1.1,6.2-2,8.3.5.2,3.5,1,8.9,2.3.3,0,.6,0,.7,0,.3-.2.2-.8,0-1.8ZM134.8,121.7c.7-1.8.9-3.7.6-5.9-.3-2.3-1.2-3.6-2.7-3.7-.8,0-2,.5-3.6,1.8-1.6,1.3-2.5,2.4-2.5,3.1-.2,1.8,2.5,3.4,8.2,4.7ZM126.5,110.6c-.7-4-.2-6.8,1.6-8.3,1.4-1.1,2.9-1.6,4.7-1.5,1.7.2,3.5,1,5.5,2.3,7,4.9,11.5,10.4,13.3,16.5.1.4.2.9.1,1.6-.2,2-1.1,4.3-2.6,6.8-1.5,2.5-2.9,3.7-4.1,3.6-.4,0-3.9-.7-10.3-2.1-3.8,4.2-8.3,7.9-13.6,11-6.2,3.6-11.8,6.2-16.8,7.9-1.1.4-6.8,1.9-17.3,4.6-1.7.4-2.8.6-3.3.5-.2,0-.4,0-.4-.2,0-.3,1.1-1,3-2,7.9-3.6,15.7-7.2,23.6-10.8,9-4.1,16.1-8.1,21.1-12.1-5.7-1.9-8.4-4.9-8-8.9.4-3.3,1.5-6.3,3.5-9Z"/>
        <path fill={accent} d="M109.4,35.6c3.6,0,6.8,2.1,9.6,6.3,2.9,4.2,4.8,9.7,6,16.5.1.7.2,1.1.2,1.2.1.2.2.2.3,0,0-.1.2-.5.5-1.2.6-4.1,1.9-10.2,4.2-18.2,2.4-5.8,5.1-8.7,7.9-8.7s2.9,1,4.4,2.9c1.3,1.7,1.9,3.1,1.9,4.2s-.2,1.9-.7,3.3c-.6,1.8-1.2,2.7-2,2.7s-1-.7-2.1-2.1c-1.1-1.4-2.2-2-3.4-2-2.5,0-4.9,6-7.1,18-.9,5.2-2,8.9-3.1,11.1-.8,1.5-1.5,2.2-2.1,2.2s-.7-.7-.7-2c0-2.1-1.2-6.2-3.7-12.2-2.4-6.1-4.1-9.1-5.1-9.1s-1.1.2-1.3.7c-.2.4-.8.7-1.7.7s-2.5-.8-4.3-2.4c-1.8-1.6-2.6-2.9-2.6-3.8s.7-1.9,2.2-4.4c1.5-2.5,2.4-3.6,2.8-3.6Z"/>
        <path fill={accent} d="M205.7,10.5c0,3.3-1.4,6.9-4,11.1-2.8,4.3-6.3,8-10.6,11-1.7,1.2-2.7,1.9-3,1.9s0,0,0-.1c0-.2.7-1.1,2.2-2.7,7.1-7.8,10.7-13,10.7-15.6s-1.1-3.7-3.4-3.7-2.4.4-3.4,1c-.7.5-1.2.8-1.4.9-.1-.1-.3-.2-.5-.3,0-.2.2-.9.4-2,1.1-5.4,3.8-8,8-8s5.3,2.2,5.3,6.5Z"/>
        <path fill={accent} d="M121.3,94.5c0,1.5-1.9,4.8-5.6,10.1-4.3,5.9-8.3,10.3-12.1,13-2.5,1.7-10.6,4.4-24.5,8.1-2.5.6-3.7.8-3.7.7.2-.3,1-1,2.5-2.2,1.8-1.4,6.7-4.2,14.8-8.4,7.7-4.1,12.3-6.7,13.6-7.9.2-.3.4-.5.4-.7,0-1.9-6.9-2.7-20.6-2.7s-2.7,0-7.9.3c-2.5.1-3.7,0-3.7-.5s.3-1.1.9-2.2l4.9-8.3c1.4-2.4,4-3.9,7.8-4.6,1.4-.2,4.5-.3,9.5-.3,15.8,0,23.8,1.8,23.8,5.5Z"/>
        <path fill={accent} d="M187.9,135.6c0,2.9-1.2,6.2-3.6,10-2.5,3.9-5.7,7.2-9.5,9.9-1.5,1.1-2.5,1.7-2.8,1.7s0,0,0,0c0-.3.7-1.1,1.9-2.5,6.4-7,9.6-11.7,9.6-14s-1.1-3.3-3.1-3.3-2.2.3-3.1.9c-.7.4-1.1.7-1.3.7,0,0-.3-.2-.4-.2,0-.3.2-.8.4-1.8,1.1-4.8,3.4-7.2,7.2-7.2s4.8,2,4.8,5.9Z"/>
      </svg>
    ),
    accentColor: '#2D8B78',
  },
  {
    id: 'ebooks',
    label: 'E-böcker',
    sublabel: 'Islamisk litteratur',
    svgIcon: (accent) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
        <path d="M12 6s2-2 5-2 5 2 5 2v14s-2-1-5-1-5 1-5 1V6z"/>
      </svg>
    ),
    accentColor: '#3A86C8',
  },
  {
    id: 'booking',
    label: 'Boka lokal',
    sublabel: 'Boka en tid hos oss',
    svgIcon: (accent) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
        <line x1="12" y1="12" x2="12" y2="18"/>
      </svg>
    ),
    accentColor: '#2D8B78',
  },
  {
    id: 'support',
    label: 'Stöd oss',
    sublabel: 'Bidra till islam.nu',
    imgSrc: CharityIcon,
    accentColor: '#C47B2B',
  },
  {
    id: 'about',
    label: 'Om oss',
    sublabel: 'Vilka är islam.nu?',
    imgSrc: AboutIcon,
    accentColor: '#3A86C8',
  },
];

// Settings gear icon
function SettingsGearIcon({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function GridCard({ item, onPress, T, badge = 0, adminBadge = 0, pulse = false }) {
  const accent = item.accentColor || T.accent;
  return (
    <button
      onClick={onPress}
      style={{
        background: T.card,
        border: `1px solid ${pulse ? '#f59e0b' : T.border}`,
        borderRadius: 18,
        padding: '18px 14px 14px',
        cursor: 'pointer',
        textAlign: 'center',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        transition: 'transform .12s, border-color .3s',
        WebkitUserSelect: 'none',
        position: 'relative',
        boxShadow: pulse ? '0 0 0 0 rgba(245,158,11,0.4)' : 'none',
        animation: pulse ? 'cardPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Admin badge — orange, top-right */}
      {adminBadge > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          minWidth: 20, height: 20, borderRadius: 10,
          background: '#f59e0b', color: '#fff',
          fontSize: 11, fontWeight: 800, fontFamily: 'system-ui',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', boxSizing: 'border-box',
          boxShadow: '0 2px 6px rgba(245,158,11,0.5)',
          animation: 'badgePop .3s cubic-bezier(0.175,0.885,0.32,1.275)',
        }}>{adminBadge > 9 ? '9+' : adminBadge}</div>
      )}
      {/* Visitor badge — röd, bredvid admin-badge om båda finns */}
      {badge > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: adminBadge > 0 ? 38 : 10,
          minWidth: 20, height: 20, borderRadius: 10,
          background: '#ef4444', color: '#fff',
          fontSize: 11, fontWeight: 800, fontFamily: 'system-ui',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', boxSizing: 'border-box',
          boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
          animation: 'badgePop .3s cubic-bezier(0.175,0.885,0.32,1.275)',
        }}>{badge > 9 ? '9+' : badge}</div>
      )}
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: item.id === 'support' ? 'transparent' : `${accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 2,
      }}>
        {item.svgIcon ? (
          item.svgIcon(accent)
        ) : item.id === 'support' ? (
          <svg width="34" height="34" viewBox="0 0 502 502" xmlns="http://www.w3.org/2000/svg">
            <path style={{fill:'#8A501F'}} d="M39.938,163.295l20.536,20.536l32.541,32.541c5.322,5.322,13.95,5.322,19.272,0c5.322-5.322,5.322-13.95,0-19.272l31.909,31.909c5.322,5.322,13.95,5.322,19.272,0c5.322-5.322,5.322-13.95,0-19.272l9.636,9.636c5.322,5.322,13.95,5.322,19.272,0s5.322-13.95,0-19.272l-15.639-15.639c5.322,5.322,13.95,5.322,19.272,0c5.322-5.322,5.322-13.95,0-19.272l-57.782-57.782l-0.063-0.2l24.04,3.957c12.427,1.896,18.229-5.016,18.229-12.542c0-7.526-3.896-13.164-14.533-15.797L102.213,62.69l-0.005,0.014l-6.836-1.26c-3.271-0.603-8.385-2.628-14.386-5.207c-32.207,14.956-56.825,43.488-66.503,78.25C26.652,151.086,39.938,163.295,39.938,163.295z"/>
            <path style={{fill:'#FF2E3D'}} d="M492,167.421c0-67.671-54.858-122.529-122.529-122.529c-56.842,0-104.628,38.711-118.471,91.203c-13.844-52.492-61.63-91.203-118.471-91.203c-18.413,0-35.874,4.069-51.543,11.346c6.001,2.579,11.116,4.604,14.386,5.207l6.836,1.26l0.005-0.014L165.9,82.827c10.636,2.633,14.533,8.271,14.533,15.797c0,7.526-5.802,14.437-18.229,12.542l-24.04-3.957l0.063,0.2l57.782,57.782c5.322,5.322,5.322,13.95,0,19.272c-5.322,5.322-13.95,5.322-19.272,0l15.639,15.639c5.322,5.322,5.322,13.95,0,19.272s-13.95,5.322-19.272,0l-9.636-9.636c5.322,5.322,5.322,13.95,0,19.272c-5.322,5.322-13.95,5.322-19.272,0l-31.909-31.909c5.322,5.322,5.322,13.95,0,19.272s-13.95,5.322-19.272,0L60.473,183.83l-20.536-20.536c0,0-13.286-12.208-25.455-28.806C11.565,144.968,10,156.011,10,167.421c0,67.671,74.678,128.234,122.529,176.084C192.17,403.146,251,457.108,251,457.108s55.062-50.744,108.583-103.763c-28.761,10.603-55.878-16.283-55.878-16.283l-20.536-20.536l-32.541-32.541c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l-31.909-31.909c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l-9.636-9.636c-5.322-5.322-5.322-13.95,0-19.272c5.322-5.322,13.95-5.322,19.272,0l15.639,15.639c-5.322-5.322-5.322-13.95,0-19.272s13.95-5.322,19.272,0l57.781,57.782l0.2,0.063l-3.957-24.04c-1.896-12.427,5.016-18.229,12.542-18.229c7.526,0,13.164,3.896,15.797,14.533l20.136,63.687l-0.014,0.005l1.26,6.836c1.655,8.977,2.949,18.112,0.8,26.087C448.312,266.78,492,219.18,492,167.421z"/>
            <path style={{fill:'#EBD2B4'}} d="M405.555,281.628l-1.26-6.836l0.014-0.005L384.173,211.1c-2.633-10.636-8.271-14.533-15.797-14.533c-7.526,0-14.438,5.802-12.542,18.229l3.957,24.04l-0.2-0.063l-57.781-57.782c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l-15.639-15.639c-5.322-5.322-13.95-5.322-19.272,0c-5.322,5.322-5.322,13.95,0,19.272l9.636,9.636c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l31.909,31.909c-5.322-5.322-13.95-5.322-19.272,0s-5.322,13.95,0,19.272l32.541,32.541l20.536,20.536c0,0,27.117,26.886,55.878,16.283c3.306-3.275,6.607-6.559,9.888-9.84c11.251-11.251,23.986-23.206,36.884-35.79C408.505,299.74,407.21,290.605,405.555,281.628z"/>
          </svg>
        ) : (
          <img
            src={item.imgSrc}
            alt={item.label}
            style={{
              width: 30, height: 30, objectFit: 'contain',
              filter: T.isDark
                ? 'invert(1) opacity(0.85)'
                : 'invert(28%) sepia(60%) saturate(400%) hue-rotate(140deg) brightness(80%)',
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'system-ui', lineHeight: 1.2 }}>
        {item.label}
      </div>
      {item.sublabel && (
        <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'system-ui', lineHeight: 1.3 }}>
          {item.sublabel}
        </div>
      )}
    </button>
  );
}

function SupportScreen({ onBack, T }) {
  const scrollRef = useRef(null);
  // iOS scroll-restore guard — tvinga scrollTop=0 vid mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = 0; });
    }
  }, []); // eslint-disable-line

  const { visible: headerVisible, onScroll } = useScrollHide({ threshold: 40 });
  useEffect(() => {
    const handler = () => onBack();
    window.addEventListener('edgeSwipeBack', handler);
    return () => window.removeEventListener('edgeSwipeBack', handler);
  }, [onBack]);

  const divider = <div style={{ height: 1, background: T.border, margin: '0 0' }} />;

  const PaymentBlock = ({ children }) => (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {children}
    </div>
  );

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 16px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg, zIndex: 10, position: 'sticky', top: 0,
        maxHeight: headerVisible ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.accent, fontSize: 22, padding: '4px 8px 4px 0',
          lineHeight: 1, fontWeight: 300,
          WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: '-.3px' }}>Stöd oss</span>
        </button>
      </div>

      {/* Intro text */}
      <div style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 12px', letterSpacing: '-.3px' }}>
          Stöd oss
        </h2>
        <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.7, margin: '0 0 10px' }}>
          Var med och sprid gott genom att bli månadsgivare eller donera en gåva.
        </p>
        <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.7, margin: 0 }}>
          Kom ihåg att du belönas för det arbete vi kan utföra tack vare ditt bidrag! Profeten (ﷺ) sade: <em>"Den som vägleder till gott får samma belöning som den som utför handlingen"</em>. [Muslim]
        </p>
      </div>

      {/* Payment methods */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, margin: '20px 16px', overflow: 'hidden' }}>

          {/* Label */}
          <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: T.textMuted }}>Ge en gåva</span>
          </div>

          {/* Bitcoin */}
          <PaymentBlock>
            {/* Bitcoin logo inline SVG */}
            <svg width="120" height="32" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="16" fill="#F7931A"/>
              <path d="M22.5 13.8c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.6 2.6-1.3-.3.6-2.6-1.6-.4-.7 2.7-1.1-.3v0l-2.2-.5-.4 1.7s1.2.3 1.1.3c.6.2.7.6.7.9l-1.7 6.8c-.1.2-.3.5-.8.4.0.0-1.1-.3-1.1-.3l-.8 1.8 2.1.5 1.1.3-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.7.5 4.7.3 5.6-2.1.7-2-.0-3.1-1.5-3.9 1.1-.2 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .6l.9-3.6c1.1.3 4.6.8 4.1 3zm.5-5.2c-.5 1.8-3.3.9-4.3.6l.8-3.3c.9.2 3.9.7 3.5 2.7z" fill="white"/>
              <text x="38" y="21" fontFamily="system-ui, -apple-system, sans-serif" fontSize="16" fontWeight="700" fill={T.isDark ? '#fff' : '#1a1a1a'}>bitcoin</text>
            </svg>
            <a
              href="bitcoin:bc1qe62zvm59cltlkqjekz4vz9nueh7hq3ejxcsktk"
              style={{
                fontSize: 12, color: T.accent, wordBreak: 'break-all',
                textAlign: 'center', textDecoration: 'underline',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              bc1qe62zvm59cltlkqjekz4vz9nueh7hq3ejxcsktk
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </PaymentBlock>

          {divider}

          {/* Swish */}
          <PaymentBlock>
            <div style={{ background: '#fff', borderRadius: 10, padding: '6px 14px', display: 'inline-flex', alignItems: 'center' }}>
              <img src={SwishLogo} alt="Swish" style={{ height: 32, objectFit: 'contain' }} />
            </div>
            <a
              href="https://app.swish.nu/1/p/sw/?sw=1236433940&msg=&src=qr"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 22, fontWeight: 800, color: T.accent,
                textDecoration: 'underline', letterSpacing: '1px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              123 643 39 40
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </PaymentBlock>

          {divider}

          {/* Bankgirot */}
          <PaymentBlock>
            <img src={BankgirotLogo} alt="Bankgirot" style={{ height: 36, objectFit: 'contain' }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '1px' }}>
              5323-2344
            </span>
          </PaymentBlock>
        </div>

        {/* Månadsgivare CTA */}
        <div style={{ padding: '0 16px' }}>
          <button
            onClick={() => window.open('https://islam.nu/stod-oss/', '_blank')}
            style={{
              width: '100%', padding: '16px', borderRadius: 14,
              background: T.accent, color: '#fff',
              fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Eller bli månadsgivare
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: T.textMuted, marginTop: 10 }}>Öppnas i din webbläsare</p>
        </div>
      </div>
    </div>
  );
}

export default function MoreScreen({ onTabBarHide, onTabBarShow, initialView, markVisitorSeen, markAdminSeen, activateForDevice, registerAdminDevice, dismissAdminDevice, bookingBadge = 0, visitorBadge = 0, adminBadge = 0, onRefreshNotifications }) {
  const { theme: T } = useTheme();
  const { visible: headerVisible, onScroll } = useScrollHide({ threshold: 40 });
  // Parse initialView — supports 'booking-my:<bookingId>' for deep-linking to My Bookings
  const [highlightBookingId] = useState(() => {
    if (initialView?.startsWith('booking-my:')) return initialView.split(':')[1] || null;
    return null;
  });
  const [view, setView] = useState(() => {
    if (initialView?.startsWith('booking-my:')) return 'booking';
    return initialView || 'menu';
  });
  const scrollRef = useRef(null);
  const savedScrollRef = useRef(0);

  // Save scroll position before leaving menu
  const navigateTo = useCallback((newView) => {
    // Save scroll position from nearest scrollable ancestor (App's scroll container)
    if (scrollRef.current) {
      let el = scrollRef.current.parentElement;
      while (el && el.scrollTop === 0 && el !== document.body) el = el.parentElement;
      savedScrollRef.current = el ? el.scrollTop : 0;
    }
    window.dispatchEvent(new CustomEvent('scrollToTop'));
    setView(newView);
  }, []);

  // Restore scroll position when returning to menu
  const backToMenu = useCallback(() => {
    const savedPos = savedScrollRef.current;
    setView('menu');
    // Restore App-level scroll position
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('restoreScroll', { detail: { top: savedPos } }));
    });
  }, []);

  // Edge swipe on menu itself → go to previous tab (onBack from App)
  const onBack = undefined; // MoreScreen has no parent back — edge swipe handled by App

  const handleOpenBooking = () => {
    navigateTo('booking');
  };

  const handleOpenAdminLogin = () => {
    navigateTo('booking-admin-login');
  };

  if (view === 'asmaul-husna') return <AsmaulHusnaScreen onBack={() => { onTabBarShow?.(); backToMenu(); }} onMount={() => onTabBarHide?.()} />;
  if (view === 'settings') return <SettingsScreen onBack={backToMenu} />;
  if (view === 'ebooks')   return <EbooksScreen onReaderOpen={() => {}} onReaderClose={() => {}} resetToLibrary={false} onTabBarHide={onTabBarHide} onTabBarShow={onTabBarShow} onBack={backToMenu} />;
  if (view === 'about')    return <AboutScreen onBack={backToMenu} />;
  if (view === 'support')  return <SupportScreen onBack={backToMenu} T={T} />;
  if (view === 'booking' || view === 'booking-admin-login')
    return <BookingScreen
      onBack={backToMenu}
      activateForDevice={activateForDevice}
      registerAdminDevice={registerAdminDevice}
      dismissAdminDevice={dismissAdminDevice}
      startAtAdminLogin={view === 'booking-admin-login'}
      startAtAdmin={view === 'booking' && localStorage.getItem('islamnu_admin_mode') === 'true' && !highlightBookingId}
      startAtMyBookings={!!highlightBookingId}
      highlightBookingId={highlightBookingId}
      onTabBarHide={onTabBarHide}
      onTabBarShow={onTabBarShow}
      onMarkAdminSeen={markAdminSeen}
      onMarkVisitorSeen={markVisitorSeen}
      onRefreshNotifications={onRefreshNotifications}
    />;

  return (
    <div ref={scrollRef} onScroll={onScroll} style={{ background: T.bg, minHeight: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes cardPulse {
          0%   { box-shadow: 0 0 0 0px rgba(245,158,11,0.45); border-color: #f59e0b66; }
          60%  { box-shadow: 0 0 0 8px rgba(245,158,11,0); border-color: #f59e0b44; }
          100% { box-shadow: 0 0 0 0px rgba(245,158,11,0); border-color: #f59e0b66; }
        }
        @keyframes badgePop {
          0%   { transform: scale(0); }
          80%  { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div style={{
        padding: '20px 16px 12px', paddingTop: 'max(20px, env(safe-area-inset-top))',
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        maxHeight: headerVisible ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Header row: title + settings icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('scrollToTop'))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, WebkitTapHighlightColor: 'transparent' }}
          >
            <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-.4px' }}>
              Visa mer
            </div>
          </button>
          <button
            onClick={() => setView('settings')}
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <SettingsGearIcon color={T.textMuted} />
          </button>
        </div>
      </div>

      {/* Grid layout */}
      <div style={{ padding: '16px 16px 32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
        }}>
          {MENU_ITEMS.map(item => (
            <GridCard
              key={item.id}
              item={item}
              onPress={item.id === 'booking' ? handleOpenBooking : () => navigateTo(item.id)}
              T={T}
              badge={item.id === 'booking' ? visitorBadge : 0}
              adminBadge={item.id === 'booking' ? adminBadge : 0}
              pulse={item.id === 'booking' && (visitorBadge > 0 || adminBadge > 0)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
