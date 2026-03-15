import React, { useEffect, useRef } from 'react';

interface Point {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

const AnimatedBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let points: Point[] = [];
        const numPoints = 80;
        const connectionDistance = 150;
        const pointSpeed = 0.5;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initPoints();
        };

        const initPoints = () => {
            points = [];
            for (let i = 0; i < numPoints; i++) {
                points.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * pointSpeed,
                    vy: (Math.random() - 0.5) * pointSpeed,
                });
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Subtle light gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(1, 'rgba(248, 250, 252, 1)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.4)'; // Dark points
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)'; // Dark lines

            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];

                // Update position
                p1.x += p1.vx;
                p1.y += p1.vy;

                // Bounce off edges
                if (p1.x < 0 || p1.x > canvas.width) p1.vx *= -1;
                if (p1.y < 0 || p1.y > canvas.height) p1.vy *= -1;

                // Draw point
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, 1.5, 0, Math.PI * 2);
                ctx.fill();

                // Draw connections
                for (let j = i + 1; j < points.length; j++) {
                    const p2 = points[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        // Opacity based on distance
                        const opacity = 1 - distance / connectionDistance;
                        ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.25})`;
                        ctx.stroke();
                    }
                }
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        draw();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -2, // Behind the hero glow
                pointerEvents: 'none',
            }}
        />
    );
};

export default AnimatedBackground;
