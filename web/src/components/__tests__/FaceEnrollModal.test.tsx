import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaceEnrollModal from "../FaceEnrollModal";

jest.mock("@/lib/faceTracking", () => ({
  useFaceTracking: () => ({
    faceBox: { leftPct: 20, topPct: 20, widthPct: 40, heightPct: 40 },
    engine: "ready"
  })
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FaceEnrollModal", () => {
  beforeEach(() => {
    const fakeStream = {
      getTracks: () => [{ stop: jest.fn() }]
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(fakeStream)
      }
    });

    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => ({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D));

    jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValueOnce("data:image/jpeg;base64,abc123")
      .mockReturnValueOnce("data:image/jpeg;base64,def456")
      .mockReturnValueOnce("data:image/jpeg;base64,ghi789");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reseta estado de busy apos sucesso do onEnroll", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<void>();
    const onEnroll = jest.fn().mockReturnValue(deferred.promise);

    render(<FaceEnrollModal onClose={jest.fn()} onEnroll={onEnroll} />);

    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /salvar base/i }));

    expect(onEnroll).toHaveBeenCalledTimes(1);
    expect(onEnroll).toHaveBeenCalledWith(["abc123", "def456", "ghi789"]);
    expect(screen.getByRole("button", { name: /cadastrando/i })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar base/i })).toBeEnabled();
    });
  });

  it("mostra erro e libera botoes quando onEnroll falha", async () => {
    const user = userEvent.setup();
    const onEnroll = jest.fn().mockRejectedValue(new Error("FACE_API_502"));

    render(<FaceEnrollModal onClose={jest.fn()} onEnroll={onEnroll} />);

    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /capturar foto/i }));
    await user.click(screen.getByRole("button", { name: /salvar base/i }));

    await waitFor(() => {
      expect(screen.getByText(/erro: face_api_502/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /salvar base/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /fechar/i })).toBeEnabled();
  });
});
