'use client';

import React, { useState, useEffect } from 'react';
import { Camera, User, ExternalLink } from 'lucide-react';
import { BACKEND_URL } from '../lib/api';

export default function SelfieThumbnail({
  src,
  alt = 'Attendance Selfie',
  className = 'w-9 h-9',
  label = 'Selfie',
  onClick = null
}) {
  const [hasError, setHasError] = useState(!src);

  useEffect(() => {
    setHasError(!src);
  }, [src]);

  const fullUrl = src
    ? (src.startsWith('http') ? src : `${BACKEND_URL}${src}`)
    : null;

  if (hasError || !fullUrl) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center text-slate-500 flex-shrink-0 select-none`}
        title="No selfie image available"
      >
        <Camera className="w-4 h-4 opacity-50" />
      </div>
    );
  }

  const content = (
    <div className={`relative ${className} rounded-xl overflow-hidden border border-blue-500/40 bg-slate-950 flex-shrink-0 group cursor-pointer transition hover:scale-105 hover:border-blue-400 shadow-sm`}>
      <img
        src={fullUrl}
        alt={alt}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-blue-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ExternalLink className="w-3.5 h-3.5 text-white drop-shadow" />
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`View ${alt}`}
        className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${alt} in new tab`}
      className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
    >
      {content}
    </a>
  );
}
