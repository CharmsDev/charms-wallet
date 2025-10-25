/**
 * Switch Component
 * A beautiful toggle switch with smooth animations and glow effect
 */
export default function Switch({ checked, onChange, label, disabled = false }) {
    return (
        <label className="flex items-center cursor-pointer group select-none">
            <div className="relative">
                {/* Hidden checkbox for accessibility */}
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    className="sr-only"
                />
                
                {/* Switch background with glow */}
                <div
                    className={`
                        relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out
                        ${checked 
                            ? 'bg-gradient-to-r from-bitcoin-500 to-bitcoin-400 shadow-lg shadow-bitcoin-500/50' 
                            : 'bg-dark-600 border border-dark-500'
                        }
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        ${!disabled && !checked ? 'group-hover:bg-dark-500 group-hover:border-dark-400' : ''}
                        ${!disabled && checked ? 'group-hover:shadow-xl group-hover:shadow-bitcoin-500/60' : ''}
                    `}
                >
                    {/* Switch toggle with shadow */}
                    <div
                        className={`
                            absolute top-0.5 left-0.5 w-5 h-5 rounded-full
                            bg-white shadow-lg
                            transform transition-all duration-300 ease-in-out
                            ${checked ? 'translate-x-5' : 'translate-x-0'}
                            ${!disabled ? 'group-hover:scale-110' : ''}
                        `}
                    >
                        {/* Inner glow when active */}
                        {checked && (
                            <div className="absolute inset-0 rounded-full bg-bitcoin-400/20 animate-pulse" />
                        )}
                    </div>
                </div>
            </div>
            
            {/* Label */}
            {label && (
                <span className={`
                    ml-3 text-sm font-medium
                    ${checked ? 'text-dark-100' : 'text-dark-300'}
                    ${disabled ? 'opacity-50' : ''}
                    ${!disabled ? 'group-hover:text-dark-50' : ''}
                    transition-colors duration-200
                `}>
                    {label}
                </span>
            )}
        </label>
    );
}
