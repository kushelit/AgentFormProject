import Image from 'next/image';

export function UnamixBadge() {
  return (
    <a
      href="https://www.unamix.co.il/"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 transition"
    >
      <span>מבית</span>
      <Image
        src="/static/img/unamix-logo.jpeg"
        alt="Unamix"
        width={90}
        height={26}
        className="h-5 w-auto object-contain"
      />
    </a>
  );
}