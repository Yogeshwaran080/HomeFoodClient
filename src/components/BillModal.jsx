import React from 'react';
import { jsPDF } from 'jspdf';
import { logClientEvent } from '../utils/logger';

export default function BillModal({ bill, onClose }) {
  if (!bill) return null;

  const handleSavePDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    let y = 15;
    const lm = 15;
    const rm = 133;
    const ctr = 74;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Sri Lakshmi Foods', ctr, y, { align: 'center' });
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Homestyle Food Catering & Monthly Subscriptions', ctr, y, { align: 'center' });
    y += 5;
    doc.text(`FSSAI: ${bill.fssai}`, ctr, y, { align: 'center' });
    y += 7;

    doc.setDrawColor(180, 140, 100);
    doc.setLineDash([2, 2]);
    doc.line(lm, y, rm, y);
    y += 6;
    doc.setLineDash([]);

    doc.setFontSize(8.5);
    const metaRows = [
      ['Bill No', bill.billNo],
      ['Date', bill.date],
      ['Time', bill.time],
      ['Customer', bill.customerName],
      ['Phone', bill.phone],
      ['Email', bill.email || '-'],
      ['Start Date', bill.startDate || '-'],
      ['End Date', bill.endDate || '-'],
      ['Validity', `${bill.validityDays} day${bill.validityDays !== 1 ? 's' : ''}`],
      ['Time Slot', bill.timeSlot || '-'],
      ['Area', bill.deliveryArea || '-']
    ];

    metaRows.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}:`, lm, y);
      doc.setFont('helvetica', 'normal');
      const valStr = String(v).length > 36 ? String(v).slice(0, 34) + '..' : String(v);
      doc.text(valStr, lm + 28, y);
      y += 5;
    });

    y += 2;
    doc.setDrawColor(180, 140, 100);
    doc.setLineDash([2, 2]);
    doc.line(lm, y, rm, y);
    y += 5;
    doc.setLineDash([]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Plan / Item', lm, y);
    doc.text('Days', lm + 72, y, { align: 'center' });
    doc.text('Amount', rm, y, { align: 'right' });
    y += 4;

    doc.setLineWidth(0.3);
    doc.setDrawColor(100);
    doc.line(lm, y, rm, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const planTotal = Number(bill.planTotal ?? (bill.unitPrice * bill.validityDays));
    const nm = bill.planName.length > 32 ? bill.planName.substring(0, 29) + '...' : bill.planName;
    doc.text(nm, lm, y);
    doc.text(String(bill.validityDays), lm + 72, y, { align: 'center' });
    doc.text(`Rs.${planTotal.toFixed(2)}`, rm, y, { align: 'right' });
    y += 4;

    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Rs.${bill.unitPrice} / day x ${bill.validityDays} days`, lm + 3, y);
    y += 5;

    if (Array.isArray(bill.customItems) && bill.customItems.length > 0) {
      doc.setTextColor(0);
      doc.setFontSize(8.5);
      bill.customItems.forEach((ci) => {
        const cname = ci.name.length > 32 ? ci.name.substring(0, 29) + '...' : ci.name;
        doc.text(cname, lm, y);
        doc.text('1', lm + 72, y, { align: 'center' });
        doc.text(`Rs.${Number(ci.amount).toFixed(2)}`, rm, y, { align: 'right' });
        y += 5;
      });
    }

    doc.setTextColor(0);
    doc.setDrawColor(180, 140, 100);
    doc.setLineDash([2, 2]);
    doc.line(lm, y, rm, y);
    y += 5;
    doc.setLineDash([]);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', lm, y);
    doc.text(`Rs.${bill.subtotal.toFixed(2)}`, rm, y, { align: 'right' });
    y += 5;

    const gstPct = Number(bill.gstPercent ?? 0);
    const cgst = Number(bill.cgstAmount ?? 0);
    const sgst = Number(bill.sgstAmount ?? 0);
    if (gstPct > 0) {
      doc.text(`CGST (${(gstPct / 2).toFixed(2)}%)`, lm, y);
      doc.text(`Rs.${cgst.toFixed(2)}`, rm, y, { align: 'right' });
      y += 4.5;
      doc.text(`SGST (${(gstPct / 2).toFixed(2)}%)`, lm, y);
      doc.text(`Rs.${sgst.toFixed(2)}`, rm, y, { align: 'right' });
      y += 5.5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('GRAND TOTAL', lm, y);
    doc.text(`Rs.${bill.grandTotal.toFixed(2)}`, rm, y, { align: 'right' });
    y += 7;

    doc.setDrawColor(180, 140, 100);
    doc.setLineDash([2, 2]);
    doc.line(lm, y, rm, y);
    y += 6;
    doc.setLineDash([]);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Thank you for choosing Sri Lakshmi Foods!', ctr, y, { align: 'center' });
    y += 4;
    doc.setFontSize(7.5);
    doc.text('Fresh Daily Homestyle Cooking', ctr, y, { align: 'center' });

    doc.save(`SriLakshmiFoods_Bill_${bill.billNo}.pdf`);
    logClientEvent('INFO', 'BILL_PDF_SAVED', { billNo: bill.billNo, customerId: bill.customerId, grandTotal: bill.grandTotal });
  };

  const handlePrint = () => {
    const planTotal = Number(bill.planTotal ?? (bill.unitPrice * bill.validityDays));
    const customItemsHtml = Array.isArray(bill.customItems)
      ? bill.customItems
          .map(
            (ci) =>
              `<div class="ir"><span class="in">${ci.name}</span><span class="iq">1</span><span class="ia">Rs.${Number(ci.amount).toFixed(2)}</span></div>`
          )
          .join('')
      : '';
    const gstPct = Number(bill.gstPercent ?? 0);
    const gstRowsHtml =
      gstPct > 0
        ? `<div class="row"><span>CGST (${(gstPct / 2).toFixed(2)}%)</span><span>Rs.${Number(bill.cgstAmount ?? 0).toFixed(2)}</span></div>
<div class="row"><span>SGST (${(gstPct / 2).toFixed(2)}%)</span><span>Rs.${Number(bill.sgstAmount ?? 0).toFixed(2)}</span></div>`
        : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Bill ${bill.billNo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;padding:5mm 3mm}
.cn{font-size:15px;font-weight:bold;text-align:center;margin-bottom:2px}.sub{font-size:9.5px;text-align:center;color:#333;margin:1px 0}
.hr{border:none;border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;font-size:9.5px;margin:2px 0;gap:6px}
.ih{display:flex;font-weight:bold;font-size:9.5px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:4px}
.ir{display:flex;font-size:9.5px;margin:2px 0}.in{flex:1}.iq{width:30px;text-align:center}.ia{width:60px;text-align:right}
.iu{font-size:8px;color:#555;padding-left:4px;margin-bottom:2px}.tot{display:flex;justify-content:space-between;font-size:12px;font-weight:bold;margin-top:4px;padding-top:3px;border-top:2px solid #000}
.ft{text-align:center;font-size:9.5px;margin-top:8px;line-height:1.5}@media print{@page{size:72mm auto;margin:0}}
</style></head><body>
<div class="cn">Sri Lakshmi Foods</div>
<div class="sub">Homestyle Food Catering &amp; Monthly Subscriptions</div>
<div class="sub">FSSAI: ${bill.fssai}</div>
<hr class="hr">
<div class="row"><span>Bill No:</span><span>${bill.billNo}</span></div>
<div class="row"><span>Date:</span><span>${bill.date}</span></div>
<div class="row"><span>Time:</span><span>${bill.time}</span></div>
<div class="row"><span>Customer:</span><span>${bill.customerName}</span></div>
<div class="row"><span>Phone:</span><span>${bill.phone}</span></div>
<div class="row"><span>Email:</span><span>${bill.email || '-'}</span></div>
<div class="row"><span>Start Date:</span><span>${bill.startDate || '-'}</span></div>
<div class="row"><span>End Date:</span><span>${bill.endDate || '-'}</span></div>
<div class="row"><span>Validity:</span><span>${bill.validityDays} day(s)</span></div>
<div class="row"><span>Time Slot:</span><span>${bill.timeSlot || '-'}</span></div>
<div class="row"><span>Area:</span><span>${bill.deliveryArea || '-'}</span></div>
<hr class="hr">
<div class="ih"><span class="in">Plan / Item</span><span class="iq">Days</span><span class="ia">Amount</span></div>
<div class="ir"><span class="in">${bill.planName}</span><span class="iq">${bill.validityDays}</span><span class="ia">Rs.${planTotal.toFixed(2)}</span></div>
<div class="iu">@ Rs.${bill.unitPrice} per day</div>
${customItemsHtml}
<hr class="hr">
<div class="row"><span>Subtotal</span><span>Rs.${bill.subtotal.toFixed(2)}</span></div>
${gstRowsHtml}
<hr class="hr">
<div class="tot"><span>GRAND TOTAL</span><span>Rs.${bill.grandTotal.toFixed(2)}</span></div>
<hr class="hr">
<div class="ft"><div>** Thank you for choosing Sri Lakshmi Foods! **</div><div>Fresh Daily Homestyle Cooking</div></div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()};setTimeout(function(){window.close()},3000)}<\/script>
</body></html>`;

    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) {
      alert('Please allow popups to print the bill.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    logClientEvent('INFO', 'BILL_PRINTED', { billNo: bill.billNo, customerId: bill.customerId });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (matching uploaded Bill Preview style) */}
        <div className="bg-[#2c1a0e] text-[#e8c99a] px-5 py-4 flex items-center justify-between">
          <div className="font-serif text-lg font-bold">Bill Preview</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bill preview"
            className="text-[#e8c99a]/80 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Receipt Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-white">
          <div className="max-w-[340px] mx-auto font-sans text-[#2c1a0e]">
            <div className="font-serif text-2xl font-bold text-center text-[#2c1a0e]">
              Sri Lakshmi Foods
            </div>
            <div className="text-[11px] text-[#8b5e3c] text-center mt-0.5">
              Homestyle Food Catering &amp; Monthly Subscriptions
            </div>
            <div className="text-[11px] text-[#8b5e3c] text-center mt-0.5">
              FSSAI: {bill.fssai}
            </div>

            <hr className="border-0 border-t border-dashed border-[#e8c99a] my-3" />

            <div className="space-y-1 text-xs text-[#6b3a2a]">
              {[
                ['Bill No', bill.billNo],
                ['Date', bill.date],
                ['Time', bill.time],
                ['Customer', bill.customerName],
                ['Phone', bill.phone],
                ['Email', bill.email || '-'],
                ['Start Date', bill.startDate || '-'],
                ['End Date', bill.endDate || '-'],
                ['Validity', `${bill.validityDays} day${bill.validityDays !== 1 ? 's' : ''}`],
                ['Time Slot', bill.timeSlot || '-'],
                ['Area', bill.deliveryArea || '-'],
                ['Address', bill.address || '-']
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="font-semibold shrink-0">{k}</span>
                  <span className="text-right break-words text-[#2c1a0e]">{v}</span>
                </div>
              ))}
            </div>

            <hr className="border-0 border-t border-dashed border-[#e8c99a] my-3" />

            <div className="flex text-[11px] font-bold uppercase text-[#8b5e3c] mb-1.5">
              <span className="flex-1">Plan / Item</span>
              <span className="w-12 text-center">Days</span>
              <span className="w-20 text-right">Amt</span>
            </div>

            <div className="flex text-xs font-semibold text-[#2c1a0e] py-0.5">
              <span className="flex-1">{bill.planName}</span>
              <span className="w-12 text-center text-[#8b5e3c]">{bill.validityDays}</span>
              <span className="w-20 text-right">
                ₹{Number(bill.planTotal ?? (bill.unitPrice * bill.validityDays)).toFixed(2)}
              </span>
            </div>
            <div className="text-[11px] text-[#8b5e3c] pl-1 pb-1">
              ₹{bill.unitPrice} / day &times; {bill.validityDays} days
            </div>

            {Array.isArray(bill.customItems) &&
              bill.customItems.map((ci, idx) => (
                <div key={idx} className="flex text-xs font-semibold text-[#2c1a0e] py-0.5 border-t border-dashed border-[#f3e2c7]">
                  <span className="flex-1">{ci.name}</span>
                  <span className="w-12 text-center text-[#8b5e3c]">1</span>
                  <span className="w-20 text-right">₹{Number(ci.amount).toFixed(2)}</span>
                </div>
              ))}

            <hr className="border-0 border-t border-dashed border-[#e8c99a] my-3" />

            <div className="flex justify-between text-xs text-[#6b3a2a] mb-1">
              <span>Subtotal</span>
              <span>₹{bill.subtotal.toFixed(2)}</span>
            </div>
            {Number(bill.gstPercent ?? 0) > 0 && (
              <>
                <div className="flex justify-between text-xs text-[#6b3a2a] mb-1">
                  <span>CGST ({(Number(bill.gstPercent) / 2).toFixed(2)}%)</span>
                  <span>₹{Number(bill.cgstAmount ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-[#6b3a2a] mb-1">
                  <span>SGST ({(Number(bill.gstPercent) / 2).toFixed(2)}%)</span>
                  <span>₹{Number(bill.sgstAmount ?? 0).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-base font-extrabold text-[#2c1a0e] border-t-2 border-[#2c1a0e] pt-2 mt-1">
              <span>GRAND TOTAL</span>
              <span>₹{bill.grandTotal.toFixed(2)}</span>
            </div>

            <hr className="border-0 border-t border-dashed border-[#e8c99a] my-3" />

            <div className="text-center text-xs text-[#8b5e3c] space-y-0.5 mt-3">
              <div className="font-semibold">Thank you for choosing Sri Lakshmi Foods!</div>
              <div>Fresh Daily Homestyle Cooking</div>
            </div>
          </div>
        </div>

        {/* Modal Footer Buttons: Close, Save PDF, Print */}
        <div className="px-4 py-3.5 bg-[#fdf6ec] border-t border-[#e8c99a] flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[#f5ede0] border border-[#e8c99a] text-[#6b3a2a] text-xs font-bold hover:bg-[#e8c99a]/40 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSavePDF}
            className="flex-1 py-2.5 rounded-xl bg-[#e8f0fd] border border-[#b5d0f5] text-[#1a73e8] text-xs font-bold hover:bg-[#d2e3fc] transition-colors"
          >
            Save PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-[#1a73e8] hover:bg-[#155ec0] text-white text-xs font-bold transition-colors"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
