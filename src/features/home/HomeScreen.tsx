import { Link } from "react-router-dom";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

interface HomeSection {
  to: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
}

const EXCHANGE_TYPES: HomeSection[] = [
  {
    to: "/fanout",
    title: "Fanout",
    desc: "Difunde el mensaje a todas las colas vinculadas, ignorando la routing key.",
    icon: "🔀",
    color: MODULE_ACCENTS.fanout,
  },
  {
    to: "/direct",
    title: "Direct",
    desc: "Enruta por coincidencia exacta entre routing key y binding key.",
    icon: "🎯",
    color: MODULE_ACCENTS.direct,
  },
  {
    to: "/topic",
    title: "Topic",
    desc: "Enruta por patrones jerárquicos usando comodines * y #.",
    icon: "🌐",
    color: MODULE_ACCENTS.topic,
  },
  {
    to: "/headers",
    title: "Headers",
    desc: "Enruta según metadatos del mensaje, con lógica all/any.",
    icon: "🏷️",
    color: MODULE_ACCENTS.headers,
  },
  {
    to: "/default",
    title: "Default Exchange",
    desc: "El exchange sin nombre: envía directo a una cola por su nombre.",
    icon: "📦",
    color: MODULE_ACCENTS.default,
  },
];

// A diferencia de los tipos de arriba, estos no son "más tipos de exchange":
// son patrones que combinan los tipos base para resolver un problema distinto
// (reenvío entre exchanges, fallback, mensajes rechazados). Se muestran en su
// propio grupo para no confundirlos con un 6to/7mo tipo de exchange.
const PATTERNS: HomeSection[] = [
  {
    to: "/exchange-to-exchange",
    title: "Exchange ↔ Exchange",
    desc: "Un exchange bindeado a otro exchange: los mensajes que matchean se reenvían intactos al segundo.",
    icon: "🔗",
    color: MODULE_ACCENTS.bridge,
  },
  {
    to: "/alternate-exchange",
    title: "Alternate Exchange",
    desc: "Un exchange con un exchange alternativo configurado: lo que no matchea nada se reenvía solo, sin perderse.",
    icon: "🛟",
    color: MODULE_ACCENTS.alternate,
  },
  {
    to: "/dead-letter",
    title: "Dead Letter Exchange",
    desc: "Una cola con un exchange de \"cartas muertas\": lo que se rechaza, expira o desborda se reenvía solo, para inspeccionar después.",
    icon: "💀",
    color: MODULE_ACCENTS.dlx,
  },
];

function SectionGrid({ title, sections }: { title: string; sections: HomeSection[] }) {
  return (
    <div className="home-section">
      <div className="section-title">{title}</div>
      <div className="home-grid">
        {sections.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="card home-card"
            style={{ "--home-accent": s.color } as React.CSSProperties}
          >
            <div className="home-card-icon">{s.icon}</div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HomeScreen() {
  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h1>RabbitMQ Playground</h1>
          <p>
            Una herramienta visual para experimentar con los tipos de Exchange de RabbitMQ y cómo se combinan entre
            sí. Cada sección declara una topología real en un broker de RabbitMQ, y te deja enviar mensajes y ver en
            vivo cómo se enrutan, se entregan y se confirman.
          </p>
        </div>
      </div>
      <SectionGrid title="Tipos de Exchange" sections={EXCHANGE_TYPES} />
      <SectionGrid title="Patrones y arquitecturas" sections={PATTERNS} />
    </div>
  );
}
