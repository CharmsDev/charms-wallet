'use client';

const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">{title}</h2>
                </div>
                <div className="p-6 text-gray-300">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
