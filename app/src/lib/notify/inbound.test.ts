import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OPTED_OUT_ERROR, replyKeyword, sameSignature, twilioSignature } from "./inbound";

describe("texts from clients", () => {
  it("signs like Twilio (checked against an independent HMAC)", async () => {
    const url = "https://chairvana.app/api/twilio/inbound";
    const params = { From: "+12565551234", To: "+12565550000", Body: "STOP", MessageSid: "SM123" };
    const expected = createHmac("sha1", "secret-token").update(url + "BodySTOPFrom+12565551234MessageSidSM123To+12565550000").digest("base64");
    expect(await twilioSignature("secret-token", url, params)).toBe(expected);
    expect(sameSignature(expected, expected)).toBe(true);
    expect(sameSignature(expected, expected.slice(0, -1) + "x")).toBe(false);
  });

  it("reads STOP, START and HELP", () => {
    expect(replyKeyword("stop")).toBe("stop");
    expect(replyKeyword(" Unsubscribe. ")).toBe("stop");
    expect(replyKeyword("Start")).toBe("start");
    expect(replyKeyword("help")).toBe("help");
    expect(replyKeyword("please stop texting me")).toBeNull();
    expect(replyKeyword("whatever", "STOP")).toBe("stop");
    expect(replyKeyword("See you Friday!")).toBeNull();
  });

  it("spots Twilio's opted-out error", () => {
    expect(OPTED_OUT_ERROR.test("Twilio 21610: Attempt to send to unsubscribed recipient")).toBe(true);
    expect(OPTED_OUT_ERROR.test("Twilio 21211: Invalid 'To' Phone Number")).toBe(false);
  });
});
