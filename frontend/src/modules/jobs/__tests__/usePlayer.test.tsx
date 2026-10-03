import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePlayer } from "../hooks/usePlayer";

// Mirrors JobDetailPage: the <audio> element only mounts after the hook (once media exists).
const Harness = ({ hasMedia }: { hasMedia: boolean }) => {
  const { mediaRef, player } = usePlayer();
  return (
    <div>
      {hasMedia && <audio ref={mediaRef} data-testid="audio" />}
      <span data-testid="time">{player.currentTime}</span>
      <button type="button" onClick={() => player.seek(12)}>
        seek
      </button>
    </div>
  );
};

function setCurrentTime(el: HTMLElement, value: number) {
  Object.defineProperty(el, "currentTime", { value, writable: true, configurable: true });
}

describe("usePlayer", () => {
  it("tracks time when the audio element mounts after the hook", () => {
    const { rerender } = render(<Harness hasMedia={false} />);
    rerender(<Harness hasMedia />);

    const audio = screen.getByTestId("audio");
    setCurrentTime(audio, 7.5);
    fireEvent(audio, new Event("timeupdate"));

    expect(screen.getByTestId("time")).toHaveTextContent("7.5");
  });

  it("seek moves the element and updates state immediately", () => {
    render(<Harness hasMedia />);
    const audio = screen.getByTestId("audio");
    setCurrentTime(audio, 0);

    fireEvent.click(screen.getByRole("button", { name: "seek" }));

    expect(screen.getByTestId("time")).toHaveTextContent("12");
  });

  it("re-attaches when the media element is swapped (video falling back to audio)", () => {
    const Swap = ({ useVideo }: { useVideo: boolean }) => {
      const { mediaRef, player } = usePlayer();
      return (
        <div>
          {useVideo ? <video ref={mediaRef} data-testid="media" /> : <audio ref={mediaRef} data-testid="media" />}
          <span data-testid="time">{player.currentTime}</span>
        </div>
      );
    };
    const { rerender } = render(<Swap useVideo />);
    rerender(<Swap useVideo={false} />);

    const el = screen.getByTestId("media");
    expect(el.tagName).toBe("AUDIO");
    setCurrentTime(el, 3);
    fireEvent(el, new Event("timeupdate"));

    expect(screen.getByTestId("time")).toHaveTextContent("3");
  });

  it("seek is a no-op before media exists", () => {
    render(<Harness hasMedia={false} />);
    fireEvent.click(screen.getByRole("button", { name: "seek" }));
    expect(screen.getByTestId("time")).toHaveTextContent("0");
  });
});
