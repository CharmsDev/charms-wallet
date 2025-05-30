'use client';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
            <p className="text-lg mb-8">The page you are looking for does not exist.</p>
            <a href="/" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Return Home
            </a>
        </div>
    );
}
