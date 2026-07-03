const CELEBRATION_EMOJIS = ["🎉", "✨", "💛", "🌸", "🎊"];

export default function CelebrationParticles() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[900] overflow-hidden">
      {CELEBRATION_EMOJIS.map((emoji, i) => (
        <span
          key={i}
          className="absolute text-xl animate-celebrate"
          style={{
            left: `${10 + i * 20}%`,
            top: "55%",
            animationDelay: `${i * 0.15}s`,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
