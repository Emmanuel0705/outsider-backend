import { createElement } from "react";
import mongoose from "mongoose";
import { UserProfile } from "../../db/models/UserProfile";
import TicketConfirmationEmail from "../../email/ticket-confirmation";
import { sendEmail } from "../../lib/email";
import { findUsers } from "../../lib/users";
import { DEFAULT_APP_URL, displayName } from "../checkin/checkin.rules";
import { createNotification } from "../notifications/notifications.service";
import { countTickets, eventWhen, giftNotice, purchaseNotice, wantsNotification } from "./ticket-delivery";

const APP_URL = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, "");

const naira = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);

interface DeliveredOrder {
  _id: mongoose.Types.ObjectId;
  items: Array<{ ticketTierName: string; quantity: number; unitPrice: number }>;
}

export interface PurchaseDelivery {
  buyerId: mongoose.Types.ObjectId;
  buyerEmail?: string | null;
  event: { title: string; startDate: Date; location?: string; address?: string; venue?: string };
  reference: string;
  total: number;
  buyerOrder: DeliveredOrder | null;
  gifts: Array<{ recipientId: mongoose.Types.ObjectId; order: DeliveredOrder }>;
}

async function attempt(label: string, task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error(`[ticket-notifier] ${label} failed:`, error);
  }
}

/**
 * Tells everyone about a completed purchase: in-app notifications for the buyer
 * and each person they bought for, plus a confirmation email to the buyer.
 * Never throws: the purchase has already succeeded.
 */
export async function deliverPurchase(p: PurchaseDelivery) {
  const recipientIds = p.gifts.map((g) => g.recipientId);
  const [users, profiles] = await Promise.all([
    findUsers([p.buyerId, ...recipientIds]),
    UserProfile.find({ userId: { $in: [p.buyerId, ...recipientIds] } })
      .select("userId notificationPrefs")
      .lean(),
  ]).catch((error) => {
    console.error("[ticket-notifier] lookup failed:", error);
    return [new Map(), []] as const;
  });
  const prefsOf = (id: mongoose.Types.ObjectId) =>
    profiles.find((profile) => String(profile.userId) === String(id))?.notificationPrefs;

  const buyer = users.get(String(p.buyerId));
  const buyerShort = displayName(buyer?.name);
  const selfCount = p.buyerOrder ? countTickets(p.buyerOrder.items) : 0;
  const giftCount = p.gifts.reduce((sum, g) => sum + countTickets(g.order.items), 0);
  const buyerLink = p.buyerOrder ? `/tickets/${p.buyerOrder._id}` : "/tickets";

  const tasks: Array<Promise<void>> = [];

  if (wantsNotification(prefsOf(p.buyerId), "ticketPurchase")) {
    const notice = purchaseNotice({ eventTitle: p.event.title, startDate: p.event.startDate, selfCount, giftCount });
    tasks.push(attempt("buyer notification", () => createNotification(p.buyerId, "ticket_purchase", notice.title, notice.body, undefined, buyerLink)));
  }

  for (const gift of p.gifts) {
    if (!wantsNotification(prefsOf(gift.recipientId), "ticketReceived")) continue;
    const notice = giftNotice({
      buyerName: buyerShort,
      eventTitle: p.event.title,
      startDate: p.event.startDate,
      count: countTickets(gift.order.items),
    });
    tasks.push(
      attempt("gift notification", () =>
        createNotification(gift.recipientId, "ticket_received", notice.title, notice.body, buyer?.image ?? undefined, `/tickets/${gift.order._id}`)
      )
    );
  }

  const email = p.buyerEmail ?? buyer?.email;
  if (email) {
    // Every ticket paid for, mine and gifted, grouped by tier.
    const allItems = [...(p.buyerOrder?.items ?? []), ...p.gifts.flatMap((g) => g.order.items)];
    const byTier = new Map<string, { quantity: number; amount: number }>();
    for (const item of allItems) {
      const line = byTier.get(item.ticketTierName) ?? { quantity: 0, amount: 0 };
      line.quantity += item.quantity;
      line.amount += item.quantity * item.unitPrice;
      byTier.set(item.ticketTierName, line);
    }
    tasks.push(
      attempt("confirmation email", () =>
        sendEmail({
          to: email,
          subject: `Your tickets for ${p.event.title}`,
          react: createElement(TicketConfirmationEmail, {
            buyerName: buyer?.name ?? "",
            eventTitle: p.event.title,
            when: eventWhen(p.event.startDate),
            venue: p.event.venue || p.event.location || p.event.address || "",
            lines: [...byTier].map(([name, line]) => ({ name, quantity: line.quantity, amount: naira(line.amount) })),
            gifts: p.gifts.map((g) => ({
              recipient: displayName(users.get(String(g.recipientId))?.name),
              summary: g.order.items.map((i) => `${i.quantity} × ${i.ticketTierName}`).join(", "),
            })),
            total: naira(p.total),
            reference: p.reference,
            ticketsUrl: `${APP_URL}${buyerLink}`,
          }),
        })
      )
    );
  }

  await Promise.all(tasks);
}
