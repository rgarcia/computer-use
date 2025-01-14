import rrwebPlayer from "rrweb-player";

const events = await fetch("/events").then((res) => res.json());

const player = new rrwebPlayer({
  target: document.getElementById("rrweb-player")!,
  props: {
    width: 800,
    height: 400,
    autoPlay: true,
    events: events,
    skipInactive: true,
  },
});
