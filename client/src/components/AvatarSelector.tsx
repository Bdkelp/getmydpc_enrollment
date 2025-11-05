import { getAllDefaultAvatars } from "@/lib/avatarUtils";

interface AvatarSelectorProps {
  selectedAvatar?: string;
  onSelect: (avatarUrl: string) => void;
}

export function AvatarSelector({ selectedAvatar, onSelect }: AvatarSelectorProps) {
  const defaultAvatars = getAllDefaultAvatars();

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-900">Choose a Default Avatar</h4>
      <div className="grid grid-cols-3 gap-3">
        {defaultAvatars.map((avatarUrl, index) => (
          <button
            key={avatarUrl}
            type="button"
            onClick={() => onSelect(avatarUrl)}
            className={`
              relative w-16 h-16 rounded-full overflow-hidden border-2 
              hover:border-blue-400 transition-colors
              ${selectedAvatar === avatarUrl ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200'}
            `}
          >
            <img 
              src={avatarUrl} 
              alt={`Default avatar ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}