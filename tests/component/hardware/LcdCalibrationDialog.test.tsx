/**
 * @module LcdCalibrationDialog.test
 * @description Verifies the calibration wizard modal: status polling,
 * skip flow, complete-state rms display, and close behavior.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithIntl } from "../../helpers/intl-wrapper";

vi.mock("lucide-react", () => {
  function makeStub(name: string) {
    function StubIcon(props: Record<string, unknown>) {
      return <span data-testid={`icon-${name}`} {...props} />;
    }
    StubIcon.displayName = `StubIcon(${name})`;
    return StubIcon;
  }
  return {
    __esModule: true,
    X: makeStub("X"),
    Loader2: makeStub("Loader2"),
  };
});

const mockClient = {
  getDisplayCalibrationStatus: vi.fn().mockResolvedValue({
    current_step: 2,
    complete: false,
    skipped: false,
  }),
  skipDisplayCalibration: vi.fn().mockResolvedValue({ ok: true }),
};

vi.mock("@/stores/agent-connection-store", () => ({
  useAgentConnectionStore: (sel: (s: unknown) => unknown) =>
    sel({ agentUrl: "http://groundnode.local:8080", apiKey: null, client: mockClient }),
}));

const toastFn = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastFn }),
}));

import { LcdCalibrationDialog } from "@/components/hardware/LcdCalibrationDialog";

beforeEach(() => {
  toastFn.mockClear();
  mockClient.getDisplayCalibrationStatus.mockClear();
  mockClient.skipDisplayCalibration.mockClear();
  mockClient.getDisplayCalibrationStatus.mockResolvedValue({
    current_step: 2,
    complete: false,
    skipped: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LcdCalibrationDialog", () => {
  it("renders the wizard title and target panel when open", () => {
    renderWithIntl(<LcdCalibrationDialog open={true} onClose={() => {}} />);
    expect(screen.getByText("Calibrate touch screen")).toBeDefined();
  });

  it("polls the calibration status and shows the current step", async () => {
    renderWithIntl(<LcdCalibrationDialog open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(mockClient.getDisplayCalibrationStatus).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/Tap step 2\/5 on the LCD now\./)).toBeDefined();
    });
  });

  it("fires skip endpoint and closes when Skip is clicked", async () => {
    const onClose = vi.fn();
    renderWithIntl(<LcdCalibrationDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => {
      expect(mockClient.skipDisplayCalibration).toHaveBeenCalledTimes(1);
    });
    expect(onClose).toHaveBeenCalled();
    expect(toastFn).toHaveBeenCalledWith("Calibration skipped", "info");
  });

  it("renders the complete state with rms residual when complete=true", async () => {
    mockClient.getDisplayCalibrationStatus.mockResolvedValue({
      current_step: 5,
      complete: true,
      rms_residual_px: 1.42,
      skipped: false,
    });
    renderWithIntl(<LcdCalibrationDialog open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Calibration complete")).toBeDefined();
    });
    expect(screen.getByText(/Average residual: 1\.42 px/)).toBeDefined();
    expect(screen.getByText("Close")).toBeDefined();
  });

  it("does not render when open=false", () => {
    const { container } = renderWithIntl(
      <LcdCalibrationDialog open={false} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Calibrate touch screen/);
  });
});
