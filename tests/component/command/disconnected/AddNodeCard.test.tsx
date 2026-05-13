/**
 * Component tests for the Command-tab Add-a-Node card. Covers the
 * three branches (probe-by-link, install one-liner, sign-in CTA),
 * the first-pair UX warning visibility, and the PairClientError →
 * translated error mapping.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithIntl } from "../../../helpers/intl-wrapper";
import { fireEvent } from "@testing-library/react";

// Use the real lucide-react. Mocking it via Proxy fails vitest's
// static-export validation. The real module is fast enough for unit
// tests; rendering icons in happy-dom is cheap.

const { probeAgentMock, dismissMock } = vi.hoisted(() => ({
  probeAgentMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock("@/lib/agent/local-pair-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/agent/local-pair-client")
  >("@/lib/agent/local-pair-client");
  return {
    ...actual,
    probeAgent: probeAgentMock,
  };
});

// Mock the persisted Zustand stores so tests don't hit localStorage.
let browserIdentityState = { localPairWarningDismissedAt: 0 };
vi.mock("@/stores/browser-identity-store", () => ({
  useBrowserIdentityStore: (sel: (s: unknown) => unknown) =>
    sel({
      browserId: "test_browser",
      localPairWarningDismissedAt: browserIdentityState.localPairWarningDismissedAt,
      dismissLocalPairWarning: dismissMock,
    }),
}));

let localNodes: Array<{ deviceId: string }> = [];
vi.mock("@/stores/local-nodes-store", () => ({
  useLocalNodesStore: (sel: (s: unknown) => unknown) =>
    sel({
      nodes: localNodes,
    }),
}));

vi.mock(
  "@/components/command/disconnected/ProbeResultCard",
  () => ({
    ProbeResultCard: () => <div data-testid="probe-result-card" />,
  }),
);

import { AddNodeCard } from "@/components/command/disconnected/AddNodeCard";
import { PairClientError } from "@/lib/agent/local-pair-client";

beforeEach(() => {
  probeAgentMock.mockReset();
  dismissMock.mockReset();
  browserIdentityState = { localPairWarningDismissedAt: 0 };
  localNodes = [];
});

describe("AddNodeCard", () => {
  it("renders all three branches", () => {
    const { getByPlaceholderText, getByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    expect(getByPlaceholderText(/skynode/)).toBeTruthy();
    expect(getByText(/Install a new agent/)).toBeTruthy();
    expect(getByText(/Sign in for remote access/)).toBeTruthy();
  });

  it("shows the first-pair warning when no local nodes are paired", () => {
    const { getByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    expect(getByText(/Your API keys live in this browser/)).toBeTruthy();
  });

  it("hides the warning once dismissed", () => {
    browserIdentityState = { localPairWarningDismissedAt: Date.now() };
    const { queryByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    expect(queryByText(/Your API keys live in this browser/)).toBeNull();
  });

  it("hides the warning when a local node already exists", () => {
    localNodes = [{ deviceId: "x" }];
    const { queryByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    expect(queryByText(/Your API keys live in this browser/)).toBeNull();
  });

  it("calls onSignIn when the cloud branch is clicked", () => {
    const signIn = vi.fn();
    const { getByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={signIn} />,
    );
    fireEvent.click(getByText(/Sign in for remote access/));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("disables sign-in when cloudAvailable is false", () => {
    const { getByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={false} onSignIn={vi.fn()} />,
    );
    const button = getByText(/Sign in for remote access/).closest("button");
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
  });

  it("disables the probe button when the input is empty", () => {
    const { getByText } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    const probeButton = getByText(/Probe$/).closest("button");
    expect(probeButton?.disabled).toBe(true);
  });

  it("surfaces a translated error from PairClientError on probe failure", async () => {
    probeAgentMock.mockRejectedValueOnce(
      new PairClientError("mixedContentError", "raw"),
    );
    const { getByPlaceholderText, getByText, findByRole } = renderWithIntl(
      <AddNodeCard cloudAvailable={true} onSignIn={vi.fn()} />,
    );
    const input = getByPlaceholderText(/skynode/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "skynode.local" } });
    fireEvent.click(getByText(/Probe$/));
    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/Mission Control/);
  });
});
