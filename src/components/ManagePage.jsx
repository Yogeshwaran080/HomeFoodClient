import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, X } from 'lucide-react';
import BillModal from './BillModal';
import { logClientEvent } from '../utils/logger';

export default function ManagePage({ currentPath, onNavigate }) {
  const [accessChecked, setAccessChecked] = useState(false);
  const [ipAllowed, setIpAllowed] = useState(false);
  const [clientIp, setClientIp] = useState('');

  const [secretCode, setSecretCode] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState('');

  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [garbage, setGarbage] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Modals state
  // { type: 'remove-order' | 'add-customer' | 'confirm-add-customer' | 'add-days' | 'confirm-paid' | 'delete-customer', item: ... }
  const [modal, setModal] = useState(null);
  const [pendingAddPayload, setPendingAddPayload] = useState(null);
  const [modalPin, setModalPin] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [activateDuration, setActivateDuration] = useState('month'); // 'month' | 'week' | 'custom'
  const [modalDays, setModalDays] = useState(1);
  const [modalError, setModalError] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [activeBill, setActiveBill] = useState(null);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [customItems, setCustomItems] = useState([]);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemAmount, setCustomItemAmount] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [directMode, setDirectMode] = useState('phone'); // 'phone' | 'manual'
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupStatus, setLookupStatus] = useState('');
  const [directForm, setDirectForm] = useState({
    custName: '',
    custWhatsApp: '',
    custEmail: '',
    packageName: 'Only Lunch - Pure Veg',
    deliveryArea: 'Guduvancherry',
    deliveryTimeSlot: 'Afternoon Lunch (12:00 PM - 1:00 PM)',
    fullAddress: '',
    startDate: '',
    endDate: '',
    specialNotes: ''
  });

  const isCustomersView = currentPath === '/manage/customers';
  const isGarbageView = currentPath === '/manage/garbage';
  const isOrdersView = !isCustomersView && !isGarbageView;
  const getLocalTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayStr = getLocalTodayStr();

  const isEndDateCrossed = (cust) => Boolean(cust?.endDate && cust.endDate <= todayStr);

  const computeAddedEndDate = (baseDateStr, daysToAdd) => {
    const base = baseDateStr || todayStr;
    const parts = base.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return base;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + daysToAdd);
    return d.toISOString().split('T')[0];
  };

  const computeDurationEndDate = (durationType) => {
    if (durationType === 'week') return computeAddedEndDate(todayStr, 7);
    if (durationType === 'month') return computeAddedEndDate(todayStr, 30);
    return modalEndDate;
  };

  useEffect(() => {
    if (!actionNotice) return;
    const timer = setTimeout(() => setActionNotice(''), 1500);
    return () => clearTimeout(timer);
  }, [actionNotice]);

  // 1. Check IP access on mount
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch('/api/manage/access');
        const data = await res.json();
        setClientIp(data.clientIp || '');
        setIpAllowed(res.ok && data.allowed === true);
      } catch (e) {
        setIpAllowed(false);
      } finally {
        setAccessChecked(true);
      }
    };
    checkAccess();
  }, []);

  const fetchAllData = useCallback(async (codeToUse) => {
    setLoadingData(true);
    try {
      const headers = { 'x-manage-code': codeToUse };
      const [ordRes, custRes, grbRes] = await Promise.all([
        fetch('/api/manage/orders', { headers }),
        fetch('/api/manage/customers', { headers }),
        fetch('/api/manage/garbage', { headers })
      ]);
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        setOrders(ordData.orders || []);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData.customers || []);
      }
      if (grbRes.ok) {
        const grbData = await grbRes.json();
        setGarbage(grbData.garbage || []);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/manage/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: secretCode.trim() })
      });
      if (!res.ok) {
        setAuthError('Invalid secret code.');
        return;
      }
      setIsUnlocked(true);
      logClientEvent('INFO', 'MANAGE_UNLOCKED', { path: currentPath });
      await fetchAllData(secretCode.trim());
    } catch (err) {
      setAuthError('Unable to reach server. Make sure backend is running.');
    }
  };

  const normalizeEmailStr = (em) => String(em || '').trim().toLowerCase();
  const normalizeAddressStr = (addr) => String(addr || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const findDuplicateCustomer = (phone, email = '', excludeCustomerId = null) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    const em = normalizeEmailStr(email);
    for (const c of customers) {
      if (excludeCustomerId && c.customerId === excludeCustomerId) continue;
      if (digits && String(c.custWhatsApp || '').replace(/\D/g, '').slice(-10) === digits) {
        return { field: 'number', value: phone, record: c };
      }
      if (em && normalizeEmailStr(c.custEmail) === em) {
        return { field: 'email', value: email, record: c };
      }
    }
    return null;
  };

  const isPhoneInCustomers = (phone, email = '') => {
    const dup = findDuplicateCustomer(phone, email);
    return dup ? dup.record : null;
  };

  const isPhoneInOrders = (phone, email = '') => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    const em = normalizeEmailStr(email);
    return (
      orders.find(
        (o) =>
          (digits && String(o.custWhatsApp || '').replace(/\D/g, '').slice(-10) === digits) ||
          (em && normalizeEmailStr(o.custEmail) === em)
      ) || null
    );
  };

  const findMatchingAddressRecord = (addr, excludeId = null) => {
    const norm = normalizeAddressStr(addr);
    if (norm.length < 6) return null;
    const allRecords = [
      ...customers.map((c) => ({ ...c, _id: c.customerId, _source: 'Customers' })),
      ...orders.map((o) => ({ ...o, _id: o.orderId, _source: 'Orders' })),
      ...garbage.map((g) => ({ ...(g.item || {}), _id: g.garbageId, _source: 'Garbage' }))
    ];
    return (
      allRecords.find((r) => {
        if (excludeId && r._id === excludeId) return false;
        return normalizeAddressStr(r.fullAddress) === norm;
      }) || null
    );
  };

  const openModal = (type, item) => {
    if ((type === 'add-customer' || type === 'direct-add-customer') && item) {
      const existing = isPhoneInCustomers(item.custWhatsApp);
      if (existing) {
        setDuplicateAlert(
          `This number (${item.custWhatsApp}) already exists in Customers (${existing.custName}). You can only add if the customer is in Garbage.`
        );
        return;
      }
    }
    setModal({ type, item });
    setModalPin('');
    setActivateDuration('month');
    setModalEndDate(type === 'confirm-paid' ? computeAddedEndDate(todayStr, 30) : '');
    setModalDays(1);
    setShowCustomItemForm(false);
    setCustomItems([]);
    setCustomItemName('');
    setCustomItemAmount('');
    setModalEmail(item?.custEmail || '');
    setDirectMode(item ? 'manual' : 'phone');
    setLookupPhone('');
    setLookupStatus('');
    const formSource = type === 'edit-garbage' ? item?.item : item;
    setDirectForm({
      custName: formSource?.custName || '',
      custWhatsApp: formSource?.custWhatsApp || '',
      custEmail: formSource?.custEmail || '',
      packageName: formSource?.packageName || 'Only Lunch - Pure Veg',
      deliveryArea: formSource?.deliveryArea || 'Guduvancherry',
      deliveryTimeSlot: formSource?.deliveryTimeSlot || 'Afternoon Lunch (12:00 PM - 1:00 PM)',
      fullAddress: formSource?.fullAddress || '',
      startDate: formSource?.startDate || formSource?.deliveryDate || todayStr,
      endDate: type === 'edit-customer' || type === 'edit-garbage' ? (formSource?.endDate || '') : '',
      specialNotes: formSource?.specialNotes || ''
    });
    setModalError('');
    setModalBusy(false);
  };

  const handleFetchFromGarbage = () => {
    const digits = lookupPhone.replace(/\D/g, '');
    if (digits.length < 6) {
      setLookupStatus('Enter at least 6 digits of the phone number to search Garbage.');
      return;
    }
    const existing = isPhoneInCustomers(lookupPhone);
    if (existing) {
      setDuplicateAlert(
        `This number (${lookupPhone.trim()}) already exists in Customers (${existing.custName}). You can only add if the customer is in Garbage.`
      );
      return;
    }
    const matchedOrder =
      modal?.type === 'direct-add-customer'
        ? orders.find((o) => {
            const recPhone = String(o?.custWhatsApp || '').replace(/\D/g, '');
            return recPhone && (recPhone.includes(digits) || digits.includes(recPhone));
          })
        : null;

    if (matchedOrder) {
      setDirectForm({
        custName: matchedOrder.custName || '',
        custWhatsApp: matchedOrder.custWhatsApp || lookupPhone.trim(),
        custEmail: matchedOrder.custEmail || '',
        packageName: matchedOrder.packageName || 'Only Lunch - Pure Veg',
        deliveryArea: matchedOrder.deliveryArea || 'Guduvancherry',
        deliveryTimeSlot: matchedOrder.deliveryTimeSlot || 'Afternoon Lunch (12:00 PM - 1:00 PM)',
        fullAddress: matchedOrder.fullAddress || '',
        startDate: matchedOrder.deliveryDate || todayStr,
        endDate: '',
        specialNotes: matchedOrder.specialNotes || ''
      });
      setLookupStatus(`Found in Orders: ${matchedOrder.custName || 'Customer'}. Confirming payment will move them to Customers and clear the order.`);
      return;
    }

    const found = garbage.find((entry) => {
      const recPhone = String(entry?.item?.custWhatsApp || '').replace(/\D/g, '');
      return recPhone && (recPhone.includes(digits) || digits.includes(recPhone));
    });
    if (found && found.item) {
      const r = found.item;
      setDirectForm({
        custName: r.custName || '',
        custWhatsApp: r.custWhatsApp || lookupPhone.trim(),
        custEmail: r.custEmail || '',
        packageName: r.packageName || 'Only Lunch - Pure Veg',
        deliveryArea: r.deliveryArea || 'Guduvancherry',
        deliveryTimeSlot: r.deliveryTimeSlot || 'Afternoon Lunch (12:00 PM - 1:00 PM)',
        fullAddress: r.fullAddress || '',
        startDate: todayStr,
        endDate: '',
        specialNotes: r.specialNotes || ''
      });
      setLookupStatus(`Found in Garbage: ${r.custName || 'Customer'}. Review details below and click ${modal?.type === 'direct-add-order' ? 'Add Order' : 'Next'}.`);
    } else {
      setDirectForm((prev) => ({
        ...prev,
        custWhatsApp: lookupPhone.trim()
      }));
      setLookupStatus('No record found in Garbage for this phone number. Enter details manually below.');
    }
  };

  const handleCopyGarbage = async (entry) => {
    const r = entry?.item || {};
    const text = [
      `Type: ${String(entry?.type || '').toUpperCase()}`,
      `Ref ID: ${r.customerId || r.orderId || '-'}`,
      `Name: ${r.custName || '-'}`,
      `Phone: ${r.custWhatsApp || '-'}`,
      `Email: ${r.custEmail || '-'}`,
      `Plan: ${r.packageName || '-'}`,
      `Start Date: ${r.startDate || r.deliveryDate || '-'}`,
      `End Date: ${r.endDate || '-'}`,
      `Time Slot: ${r.deliveryTimeSlot || '-'}`,
      `Area: ${r.deliveryArea || '-'}`,
      `Address: ${r.fullAddress || '-'}`,
      `Notes: ${r.specialNotes || '-'}`
    ].join('\n');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('Copy command failed');
      }
      setActionNotice(`Copied details for ${r.custName || 'record'}.`);
    } catch (err) {
      setActionNotice('Unable to access clipboard.');
    }
  };

  const closeModal = () => {
    setModal(null);
    setPendingAddPayload(null);
    setModalPin('');
    setModalEndDate('');
    setModalDays(1);
    setShowCustomItemForm(false);
    setCustomItems([]);
    setCustomItemName('');
    setCustomItemAmount('');
    setModalEmail('');
    setModalError('');
    setModalBusy(false);
  };

  const handleAddCustomItem = () => {
    const trimmedName = customItemName.trim();
    const parsedAmt = Number(customItemAmount);
    if (!trimmedName || !Number.isFinite(parsedAmt) || parsedAmt < 0) {
      setModalError('Enter a valid custom item name and amount.');
      return;
    }
    setModalError('');
    setCustomItems((prev) => [...prev, { name: trimmedName, amount: Number(parsedAmt.toFixed(2)) }]);
    setCustomItemName('');
    setCustomItemAmount('');
  };

  const openCustomerWhatsApp = (record, isOrder) => {
    const digits = String(record?.custWhatsApp || '').replace(/\D/g, '');
    const waPhone = digits.length === 10 ? `91${digits}` : digits;
    if (!waPhone) {
      alert('No valid mobile number available for this record.');
      return;
    }
    const text = isOrder
      ? `Dear ${record.custName}, your request for ${record.packageName} from Sri Lakshmi HomeFood has been received (Ref: ${record.orderId}). Our team will contact you shortly. Contact: 7200451980`
      : `Dear ${record.custName}, your ${record.packageName} plan with Sri Lakshmi HomeFood is active (Start: ${record.startDate}, End: ${record.endDate}). Contact: 7200451980`;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleViewBill = async (cust) => {
    try {
      const res = await fetch(`/api/manage/customers/${cust.customerId}/bill`, {
        headers: { 'x-manage-code': secretCode.trim() }
      });
      const data = await res.json();
      if (res.ok && data.bill) {
        setActiveBill(data.bill);
        logClientEvent('INFO', 'VIEW_BILL_OPENED', { customerId: cust.customerId, billNo: data.bill.billNo });
      } else {
        alert(data.error || 'Unable to generate bill.');
      }
    } catch (e) {
      alert('Network error while generating bill.');
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!modal) return;
    setModalError('');
    setModalBusy(true);

    try {
      if (modal.type === 'remove-order') {
        const res = await fetch(`/api/manage/orders/${modal.item.orderId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: modalPin.trim() })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Invalid secret code.');
          setModalBusy(false);
          return;
        }
        setOrders(data.orders || []);
        if (data.garbage) setGarbage(data.garbage);
        closeModal();
      } else if (modal.type === 'add-customer') {
        if (!modalEndDate.trim()) {
          setModalError('End Date is required to add to customers.');
          setModalBusy(false);
          return;
        }
        const finalCustomItems = [...customItems];
        if (customItemName.trim() && customItemAmount !== '') {
          const parsedAmt = Number(customItemAmount);
          if (!Number.isFinite(parsedAmt) || parsedAmt < 0) {
            setModalError('Custom item amount must be a valid non-negative number.');
            setModalBusy(false);
            return;
          }
          finalCustomItems.push({
            name: customItemName.trim(),
            amount: Number(parsedAmt.toFixed(2))
          });
        }
        const res = await fetch(`/api/manage/orders/${modal.item.orderId}/preview-bill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: secretCode.trim(),
            endDate: modalEndDate.trim(),
            custEmail: modalEmail.trim(),
            customItems: finalCustomItems
          })
        });
        const data = await res.json();
        if (!res.ok || !data.bill) {
          setModalError(data.error || 'Unable to calculate bill preview.');
          setModalBusy(false);
          return;
        }
        setPendingAddPayload({
          orderId: modal.item.orderId,
          endDate: modalEndDate.trim(),
          custEmail: modalEmail.trim(),
          customItems: finalCustomItems,
          bill: data.bill
        });
        setModal({ type: 'confirm-add-customer', item: modal.item });
        setModalBusy(false);
      } else if (modal.type === 'confirm-add-customer' && pendingAddPayload) {
        const res = await fetch(`/api/manage/orders/${pendingAddPayload.orderId}/to-customer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: secretCode.trim(),
            endDate: pendingAddPayload.endDate,
            custEmail: pendingAddPayload.custEmail,
            customItems: pendingAddPayload.customItems
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to move order to customers.');
          setModalBusy(false);
          return;
        }
        setOrders(data.orders || []);
        setCustomers(data.customers || []);
        if (data.orders) setOrders(data.orders);
        if (data.garbage) setGarbage(data.garbage);
        if (data.emailStatus?.sent) {
          setActionNotice(`Customer added & activation email with PDF bill sent to ${data.customer?.custEmail}.`);
        } else {
          setActionNotice(`Customer added (Bill ${data.bill?.billNo || ''}). Email not sent: ${data.emailStatus?.reason || 'SMTP not configured'}`);
        }
        closeModal();
      } else if (modal.type === 'add-days') {
        const res = await fetch(`/api/manage/customers/${modal.item.customerId}/add-days`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: modalDays })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to extend end date.');
          setModalBusy(false);
          return;
        }
        setCustomers(data.customers || []);
        if (data.orders) setOrders(data.orders);
        if (data.garbage) setGarbage(data.garbage);
        closeModal();
      } else if (modal.type === 'confirm-paid') {
        const resolvedEndDate = computeDurationEndDate(activateDuration);
        if (!resolvedEndDate || !resolvedEndDate.trim()) {
          setModalError('End Date is required to activate.');
          setModalBusy(false);
          return;
        }
        const res = await fetch(`/api/manage/customers/${modal.item.customerId}/paid`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: modalPin.trim(),
            startDate: todayStr,
            endDate: resolvedEndDate.trim()
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Invalid secret code.');
          setModalBusy(false);
          return;
        }
        setCustomers(data.customers || []);
        if (data.orders) setOrders(data.orders);
        if (data.garbage) setGarbage(data.garbage);
        closeModal();
      } else if (modal.type === 'direct-add-order') {
        if (!directForm.custName.trim() || !directForm.custWhatsApp.trim()) {
          setModalError('Customer Name and Phone Number are required.');
          setModalBusy(false);
          return;
        }
        const existingCust = isPhoneInCustomers(directForm.custWhatsApp, directForm.custEmail);
        if (existingCust) {
          setModalBusy(false);
          setDuplicateAlert(
            `This phone or email already exists in Customers (${existingCust.custName}). You can only add if the customer is in Garbage.`
          );
          return;
        }
        const existingOrd = isPhoneInOrders(directForm.custWhatsApp, directForm.custEmail);
        if (existingOrd) {
          setModalBusy(false);
          setDuplicateAlert(
            `This phone or email already exists in Orders (${existingOrd.custName}).`
          );
          return;
        }
        const res = await fetch('/api/manage/orders/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: secretCode.trim(),
            ...directForm
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to add order.');
          setModalBusy(false);
          return;
        }
        setOrders(data.orders || []);
        if (data.garbage) setGarbage(data.garbage);
        setActionNotice(`Order added for ${data.order?.custName || directForm.custName}.`);
        closeModal();
      } else if (modal.type === 'direct-add-customer') {
        if (!directForm.custName.trim() || !directForm.custWhatsApp.trim()) {
          setModalError('Customer Name and Phone Number are required.');
          setModalBusy(false);
          return;
        }
        const existing = isPhoneInCustomers(directForm.custWhatsApp, directForm.custEmail);
        if (existing) {
          setModalBusy(false);
          setDuplicateAlert(
            `This phone or email already exists in Customers (${existing.custName}). You can only add if the customer is in Garbage.`
          );
          return;
        }
        if (!directForm.startDate || !directForm.endDate) {
          setModalError('Start Date and End Date are required.');
          setModalBusy(false);
          return;
        }
        const finalCustomItems = [...customItems];
        if (customItemName.trim() && customItemAmount !== '') {
          const parsedAmt = Number(customItemAmount);
          if (!Number.isFinite(parsedAmt) || parsedAmt < 0) {
            setModalError('Custom item amount must be a valid non-negative number.');
            setModalBusy(false);
            return;
          }
          finalCustomItems.push({
            name: customItemName.trim(),
            amount: Number(parsedAmt.toFixed(2))
          });
        }
        const res = await fetch('/api/manage/customers/preview-bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: secretCode.trim(),
            ...directForm,
            customItems: finalCustomItems
          })
        });
        const data = await res.json();
        if (!res.ok || !data.bill) {
          setModalError(data.error || 'Unable to calculate bill preview.');
          setModalBusy(false);
          return;
        }
        setPendingAddPayload({
          isDirectCustomer: true,
          directData: { ...directForm, customItems: finalCustomItems },
          bill: data.bill
        });
        setModal({ type: 'confirm-direct-customer', item: null });
        setModalBusy(false);
      } else if (modal.type === 'confirm-direct-customer' && pendingAddPayload?.isDirectCustomer) {
        const res = await fetch('/api/manage/customers/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: secretCode.trim(),
            ...pendingAddPayload.directData
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to add customer.');
          setModalBusy(false);
          return;
        }
        setCustomers(data.customers || []);
        if (data.orders) setOrders(data.orders);
        if (data.garbage) setGarbage(data.garbage);
        if (data.emailStatus?.sent) {
          setActionNotice(`Customer added & activation email sent to ${data.customer?.custEmail}.`);
        } else {
          setActionNotice(`Customer added (Bill ${data.bill?.billNo || ''}).`);
        }
        closeModal();
      } else if (modal.type === 'edit-customer' && modal.item) {
        if (!directForm.custName.trim() || !directForm.custWhatsApp.trim()) {
          setModalError('Customer Name and Phone Number are required.');
          setModalBusy(false);
          return;
        }
        const res = await fetch(`/api/manage/customers/${modal.item.customerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: modalPin.trim(),
            ...directForm
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to update customer.');
          setModalBusy(false);
          return;
        }
        setCustomers(data.customers || []);
        setActionNotice(`Updated details for ${data.customer?.custName || directForm.custName}.`);
        closeModal();
      } else if (modal.type === 'edit-order' && modal.item) {
        if (!directForm.custName.trim() || !directForm.custWhatsApp.trim()) {
          setModalError('Customer Name and Phone Number are required.');
          setModalBusy(false);
          return;
        }
        const res = await fetch(`/api/manage/orders/${modal.item.orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: modalPin.trim(),
            ...directForm
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to update order.');
          setModalBusy(false);
          return;
        }
        setOrders(data.orders || []);
        setActionNotice(`Updated order for ${data.order?.custName || directForm.custName}.`);
        closeModal();
      } else if (modal.type === 'edit-garbage' && modal.item) {
        if (!directForm.custName.trim() || !directForm.custWhatsApp.trim()) {
          setModalError('Customer Name and Phone Number are required.');
          setModalBusy(false);
          return;
        }
        const res = await fetch(`/api/manage/garbage/${modal.item.garbageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: modalPin.trim(),
            ...directForm
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Failed to update garbage record.');
          setModalBusy(false);
          return;
        }
        setGarbage(data.garbage || []);
        setActionNotice(`Updated archived record for ${directForm.custName}.`);
        closeModal();
      } else if (modal.type === 'delete-customer') {
        const res = await fetch(`/api/manage/customers/${modal.item.customerId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: modalPin.trim() })
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Invalid secret code.');
          setModalBusy(false);
          return;
        }
        setCustomers(data.customers || []);
        if (data.orders) setOrders(data.orders);
        if (data.garbage) setGarbage(data.garbage);
        closeModal();
      }
    } catch (err) {
      setModalError('Network error while communicating with server.');
      setModalBusy(false);
    }
  };

  // Loading IP check
  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-sans text-slate-700 text-sm">
        Checking access...
      </div>
    );
  }

  // Unauthorized IP Screen
  if (!ipAllowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-slate-900 font-serif italic mb-2">
            Access Restricted
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            The management panel can only be opened from authorized IP addresses configured in the server environment.
          </p>
          {clientIp && (
            <div className="text-xs text-slate-500 border border-slate-200 bg-slate-50 rounded-lg py-2 px-3 mb-5 font-mono">
              Detected IP: {clientIp}
            </div>
          )}
          <button
            onClick={() => onNavigate('/')}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Secret Code Gate
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-black text-slate-900 font-serif italic text-center mb-1">
            Kitchen Management
          </h1>
          <p className="text-xs text-slate-500 text-center mb-6">
            Enter secret code to access orders and customers.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Secret Code
              </label>
              <input
                type="password"
                autoFocus
                required
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                placeholder="Enter secret code"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 text-sm outline-none text-center tracking-widest font-bold"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-600 font-semibold text-center">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Unlock
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Back to Website
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pinnedCustomers = customers.filter((c) => isEndDateCrossed(c));
  const regularCustomers = customers.filter((c) => !isEndDateCrossed(c));

  const matchesSearch = (rec) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const fields = [
      rec?.orderId,
      rec?.customerId,
      rec?.custName,
      rec?.custWhatsApp,
      rec?.custEmail,
      rec?.packageName,
      rec?.deliveryArea,
      rec?.fullAddress
    ];
    return fields.some((val) => String(val || '').toLowerCase().includes(q));
  };

  const filteredOrders = orders.filter((o) => matchesSearch(o));
  const filteredPinnedCustomers = pinnedCustomers.filter((c) => matchesSearch(c));
  const filteredRegularCustomers = regularCustomers.filter((c) => matchesSearch(c));
  const filteredGarbage = garbage.filter((g) => matchesSearch(g.item || {}));

  // Daily Kitchen Supply Statistics (ONLY Active Customers, excluding expired)
  const dayOfWeek = new Date().getDay(); // 0 = Sun, 6 = Sat
  const isWeekendToday = dayOfWeek === 0 || dayOfWeek === 6;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = dayNames[dayOfWeek];

  let tiffenCount = 0;
  let lunchCount = 0;
  let dinnerCount = 0;
  let vegCount = 0;
  let nonVegCount = 0;

  regularCustomers.forEach((cust) => {
    const plan = (cust.packageName || '').toLowerCase();
    const isTiffenOrDinnerOnly =
      (plan.includes('tiffen') || plan.includes('tiffin') || plan.includes('breakfast') || plan.includes('dinner')) &&
      !plan.includes('monthly') &&
      !plan.includes('lunch');

    // Non-Veg is ONLY supported on Lunch (and Monthly Lunch Combo), never on Tiffen or Dinner
    if (!isTiffenOrDinnerOnly && (plan.includes('non-veg') || plan.includes('non veg') || plan.includes('nonveg'))) {
      nonVegCount += 1;
    } else {
      vegCount += 1;
    }

    if (plan.includes('monthly')) {
      tiffenCount += 1;
      lunchCount += 1;
      dinnerCount += 1;
    } else if (plan.includes('weekend')) {
      if (isWeekendToday) {
        tiffenCount += 1;
        lunchCount += 1;
        dinnerCount += 1;
      }
    } else {
      if (plan.includes('tiffen') || plan.includes('tiffin') || plan.includes('breakfast')) {
        tiffenCount += 1;
      }
      if (plan.includes('lunch')) {
        lunchCount += 1;
      }
      if (plan.includes('dinner')) {
        dinnerCount += 1;
      }
    }
  });

  const totalSupplyCount = tiffenCount + lunchCount + dinnerCount;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Minimal Top Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-serif italic">
              {isCustomersView ? 'Customers' : isGarbageView ? 'Garbage Archive' : 'Orders Management'}
            </h1>
            <span className="text-xs font-semibold text-slate-500 border border-slate-200 rounded-md px-2 py-0.5">
              {isCustomersView ? `${customers.length} total` : isGarbageView ? `${garbage.length} archived` : `${orders.length} orders`}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/manage')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${isOrdersView ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-800'
                }`}
            >
              Orders ({orders.length})
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/manage/customers')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${isCustomersView ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-800'
                }`}
            >
              Customers ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/manage/garbage')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${isGarbageView ? 'bg-slate-900 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-800'
                }`}
            >
              Garbage ({garbage.length})
            </button>

            <button
              type="button"
              onClick={() => fetchAllData(secretCode.trim())}
              className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {actionNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-white text-black font-normal text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-lg border border-slate-200 pointer-events-none">
          {actionNotice}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar + Add Customer Action Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email, ID, plan, area..."
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:border-slate-900 text-xs sm:text-sm outline-none bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          {(isOrdersView || isCustomersView) && (
            <button
              type="button"
              onClick={() => openModal(isOrdersView ? 'direct-add-order' : 'direct-add-customer', null)}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition-colors"
            >
              {isOrdersView ? '+ Add Order' : '+ Add Customer'}
            </button>
          )}
        </div>

        {loadingData && (
          <div className="text-xs text-slate-500 mb-4">Loading records...</div>
        )}

        {/* VIEW 1: MANAGE ORDERS (/manage) */}
        {isOrdersView && (
          <div>
            {filteredOrders.length === 0 ? (
              <div className="border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                {searchQuery ? 'No orders match your search.' : 'No pending orders found.'}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-300">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                      <th className="p-3 border-r border-slate-300">Order ID</th>
                      <th className="p-3 border-r border-slate-300">Name</th>
                      <th className="p-3 border-r border-slate-300">Phone</th>
                      <th className="p-3 border-r border-slate-300">Email</th>
                      <th className="p-3 border-r border-slate-300">Plan</th>
                      <th className="p-3 border-r border-slate-300">Bill Amount</th>
                      <th className="p-3 border-r border-slate-300">Start Date</th>
                      <th className="p-3 border-r border-slate-300">Time Slot</th>
                      <th className="p-3 border-r border-slate-300">Area</th>
                      <th className="p-3 border-r border-slate-300">Address</th>
                      <th className="p-3 border-r border-slate-300">Notes</th>
                      <th className="p-3 border-r border-slate-300">Created</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((ord) => (
                      <tr key={ord.orderId} className="border-b border-slate-200 hover:bg-slate-50 align-top">
                        <td className="p-3 border-r border-slate-200 font-mono text-xs">
                          <div className="flex flex-col items-start gap-1.5">
                            <span>{ord.orderId}</span>
                            <button
                              type="button"
                              onClick={() => openModal('edit-order', ord)}
                              title="Edit order details"
                              aria-label="Edit order details"
                              className="inline-flex items-center justify-center p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-3 border-r border-slate-200 font-semibold">{ord.custName}</td>
                        <td className="p-3 border-r border-slate-200 font-mono text-xs">{ord.custWhatsApp}</td>
                        <td className="p-3 border-r border-slate-200 text-xs">{ord.custEmail || '-'}</td>
                        <td className="p-3 border-r border-slate-200">{ord.packageName}</td>
                        <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                          {ord.estimatedGrandTotal != null ? (
                            <div>
                              <div className="font-bold text-slate-900">₹{Number(ord.estimatedGrandTotal).toFixed(2)}</div>
                              <div className="text-[11px] text-slate-500">
                                ₹{ord.estimatedUnitPrice} &times; {ord.estimatedDays || 30}d + {ord.estimatedGstPercent}% GST
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3 border-r border-slate-200 whitespace-nowrap">{ord.deliveryDate}</td>
                        <td className="p-3 border-r border-slate-200">{ord.deliveryTimeSlot}</td>
                        <td className="p-3 border-r border-slate-200">{ord.deliveryArea}</td>
                        <td className="p-3 border-r border-slate-200 max-w-xs break-words">{ord.fullAddress}</td>
                        <td className="p-3 border-r border-slate-200 max-w-xs break-words">{ord.specialNotes || '-'}</td>
                        <td className="p-3 border-r border-slate-200 text-xs text-slate-500 whitespace-nowrap">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleString() : '-'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => openModal('add-customer', ord)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded transition-colors"
                            >
                              Add To Customers
                            </button>
                            <button
                              type="button"
                              onClick={() => openCustomerWhatsApp(ord, true)}
                              className="px-3 py-1.5 border border-green-600 text-green-700 hover:bg-green-50 text-xs font-bold rounded transition-colors"
                            >
                              Message
                            </button>
                            <button
                              type="button"
                              onClick={() => openModal('remove-order', ord)}
                              className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold rounded transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: CUSTOMERS (/manage/customers) */}
        {isCustomersView && (
          <div className="space-y-8">
            {/* Pinned Yellow Warning Boxes (Paid Customers) */}
            {filteredPinnedCustomers.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700">
                  Pinned — Subscription End Date Alerts ({filteredPinnedCustomers.length})
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {filteredPinnedCustomers.map((cust) => (
                    <div
                      key={cust.customerId}
                      className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs flex-1">
                        <div>
                          <div className="text-amber-900/70 font-bold uppercase text-[10px]">Customer</div>
                          <div className="font-bold text-slate-900 text-sm">{cust.custName}</div>
                          <div className="font-mono text-slate-700">{cust.custWhatsApp}</div>
                        </div>
                        <div>
                          <div className="text-amber-900/70 font-bold uppercase text-[10px]">Plan &amp; Slot</div>
                          <div className="font-semibold text-slate-900">{cust.packageName}</div>
                          <div className="text-slate-700">{cust.deliveryTimeSlot}</div>
                        </div>
                        <div>
                          <div className="text-amber-900/70 font-bold uppercase text-[10px]">Start / End Date</div>
                          <div className="text-slate-800">Start: {cust.startDate}</div>
                          <div className="font-black text-amber-950">End: {cust.endDate}</div>
                        </div>
                        <div>
                          <div className="text-amber-900/70 font-bold uppercase text-[10px]">Area &amp; Address</div>
                          <div className="font-semibold text-slate-800">{cust.deliveryArea}</div>
                          <div className="text-slate-700 break-words">{cust.fullAddress}</div>
                        </div>
                        <div>
                          <div className="text-amber-900/70 font-bold uppercase text-[10px]">Notes &amp; Ref</div>
                          <div className="text-slate-800">{cust.specialNotes || '-'}</div>
                          <div className="font-mono text-[11px] text-slate-600">{cust.customerId} / {cust.orderId}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openModal('confirm-paid', cust)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold rounded-lg transition-colors"
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleViewBill(cust)}
                          className="px-3 py-2 border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors"
                        >
                          View Bill
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal('delete-customer', cust)}
                          className="px-3 py-2 border border-red-300 bg-white text-red-700 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Customers Plain Grid */}
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 mb-3">
                All Customers ({filteredRegularCustomers.length})
              </h2>

              {filteredRegularCustomers.length === 0 ? (
                <div className="border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  {searchQuery
                    ? 'No customers match your search.'
                    : pinnedCustomers.length > 0
                    ? 'All customers are currently pinned above.'
                    : 'No customers added yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-300">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                        <th className="p-3 border-r border-slate-300">Status</th>
                        <th className="p-3 border-r border-slate-300">Customer ID</th>
                        <th className="p-3 border-r border-slate-300">Order Ref</th>
                        <th className="p-3 border-r border-slate-300">Name</th>
                        <th className="p-3 border-r border-slate-300">Phone</th>
                        <th className="p-3 border-r border-slate-300">Email</th>
                        <th className="p-3 border-r border-slate-300">Plan</th>
                        <th className="p-3 border-r border-slate-300">Start Date</th>
                        <th className="p-3 border-r border-slate-300">End Date</th>
                        <th className="p-3 border-r border-slate-300">Time Slot</th>
                        <th className="p-3 border-r border-slate-300">Area</th>
                        <th className="p-3 border-r border-slate-300">Address</th>
                        <th className="p-3 border-r border-slate-300">Notes</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRegularCustomers.map((cust) => {
                        const crossed = isEndDateCrossed(cust);
                        return (
                          <tr key={cust.customerId} className="border-b border-slate-200 hover:bg-slate-50 align-top">
                            <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1.5">
                                {!crossed ? (
                                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-800">
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                    </span>
                                    <span>Active</span>
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-500">Cleared</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openModal('edit-customer', cust)}
                                  title="Edit customer details"
                                  aria-label="Edit customer details"
                                  className="inline-flex items-center justify-center p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3 border-r border-slate-200 font-mono text-xs">{cust.customerId}</td>
                            <td className="p-3 border-r border-slate-200 font-mono text-xs">{cust.orderId}</td>
                            <td className="p-3 border-r border-slate-200 font-semibold">{cust.custName}</td>
                            <td className="p-3 border-r border-slate-200 font-mono text-xs">{cust.custWhatsApp}</td>
                            <td className="p-3 border-r border-slate-200 text-xs">{cust.custEmail || '-'}</td>
                            <td className="p-3 border-r border-slate-200">{cust.packageName}</td>
                            <td className="p-3 border-r border-slate-200 whitespace-nowrap">{cust.startDate}</td>
                            <td className="p-3 border-r border-slate-200 whitespace-nowrap font-semibold">{cust.endDate}</td>
                            <td className="p-3 border-r border-slate-200">{cust.deliveryTimeSlot}</td>
                            <td className="p-3 border-r border-slate-200">{cust.deliveryArea}</td>
                            <td className="p-3 border-r border-slate-200 max-w-xs break-words">{cust.fullAddress}</td>
                            <td className="p-3 border-r border-slate-200 max-w-xs break-words">{cust.specialNotes || '-'}</td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex flex-col gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openModal('add-days', cust)}
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded transition-colors"
                                >
                                  Add%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleViewBill(cust)}
                                  className="px-3 py-1.5 border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-bold rounded transition-colors"
                                >
                                  View Bill
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCustomerWhatsApp(cust, false)}
                                  className="px-3 py-1.5 border border-green-600 text-green-700 hover:bg-green-50 text-xs font-bold rounded transition-colors"
                                >
                                  Message
                                </button>
                                {crossed && (
                                  <button
                                    type="button"
                                    onClick={() => openModal('confirm-paid', cust)}
                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded transition-colors"
                                  >
                                    Paid
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openModal('delete-customer', cust)}
                                  className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold rounded transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Daily Kitchen Supply Statistics (Active Customers Only) */}
            <div className="border border-slate-300 bg-slate-50/60 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-300">
                <div>
                  <h2 className="text-lg font-black text-slate-900 font-serif italic">
                    Today&apos;s Kitchen Supply Statistics
                  </h2>
                  <p className="text-xs text-slate-500">
                    Active customers only ({todayDayName}, {todayStr})
                    {isWeekendToday ? ' — Weekend Combo active (+1 to Tiffen, Lunch, Dinner)' : ' — Weekday schedule (Weekend Combo excluded)'}
                  </p>
                </div>
                <div className="text-xs font-bold text-slate-700 border border-slate-300 bg-white px-3 py-1.5">
                  Active Customers: {regularCustomers.length}
                </div>
              </div>

              {/* Plain Grid Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 border border-slate-300 bg-white">
                <div className="p-4 border-b lg:border-b-0 border-r border-slate-300">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tiffen</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{tiffenCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">meals needed</div>
                </div>

                <div className="p-4 border-b lg:border-b-0 sm:border-r border-slate-300">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lunch</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{lunchCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">meals needed</div>
                </div>

                <div className="p-4 border-b lg:border-b-0 border-r border-slate-300">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dinner</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{dinnerCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">meals needed</div>
                </div>

                <div className="p-4 border-b sm:border-b-0 lg:border-r border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-green-600 flex items-center justify-center rounded-[2px] shrink-0">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Veg</span>
                  </div>
                  <div className="text-2xl font-black text-green-700 mt-1">{vegCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">customers</div>
                </div>

                <div className="p-4 border-r border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-red-600 flex items-center justify-center rounded-[2px] shrink-0">
                      <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Non-Veg</span>
                  </div>
                  <div className="text-2xl font-black text-red-700 mt-1">{nonVegCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">customers</div>
                </div>

                <div className="p-4 bg-slate-900 text-white">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Total Supply</div>
                  <div className="text-2xl font-black text-white mt-1">{totalSupplyCount}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">total meals today</div>
                </div>
              </div>
            </div>
          </div>
        )
        }

        {/* VIEW 3: GARBAGE ARCHIVE (/manage/garbage) */}
        {
          isGarbageView && (
            <div>
              {filteredGarbage.length === 0 ? (
                <div className="border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  {searchQuery ? 'No garbage records match your search.' : 'No deleted orders or customers in garbage archive.'}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-300">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                        <th className="p-3 border-r border-slate-300">Type</th>
                        <th className="p-3 border-r border-slate-300">Deleted At</th>
                        <th className="p-3 border-r border-slate-300">Ref ID</th>
                        <th className="p-3 border-r border-slate-300">Name</th>
                        <th className="p-3 border-r border-slate-300">Phone</th>
                        <th className="p-3 border-r border-slate-300">Email</th>
                        <th className="p-3 border-r border-slate-300">Plan</th>
                        <th className="p-3 border-r border-slate-300">Dates</th>
                        <th className="p-3 border-r border-slate-300">Area</th>
                        <th className="p-3 border-r border-slate-300">Address</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGarbage.map((entry) => {
                        const rec = entry.item || {};
                        return (
                          <tr key={entry.garbageId} className="border-b border-slate-200 hover:bg-slate-50 align-top">
                            <td className="p-3 border-r border-slate-200 font-bold uppercase text-xs">
                              {entry.type}
                            </td>
                            <td className="p-3 border-r border-slate-200 text-xs text-slate-500 whitespace-nowrap">
                              {entry.deletedAt ? new Date(entry.deletedAt).toLocaleString() : '-'}
                            </td>
                            <td className="p-3 border-r border-slate-200 font-mono text-xs">
                              {rec.customerId || rec.orderId || '-'}
                            </td>
                            <td className="p-3 border-r border-slate-200 font-semibold">{rec.custName || '-'}</td>
                            <td className="p-3 border-r border-slate-200 font-mono text-xs">{rec.custWhatsApp || '-'}</td>
                            <td className="p-3 border-r border-slate-200 text-xs">{rec.custEmail || '-'}</td>
                            <td className="p-3 border-r border-slate-200">{rec.packageName || '-'}</td>
                            <td className="p-3 border-r border-slate-200 text-xs whitespace-nowrap">
                              {rec.startDate || rec.deliveryDate || '-'} {rec.endDate ? `to ${rec.endDate}` : ''}
                            </td>
                            <td className="p-3 border-r border-slate-200">{rec.deliveryArea || '-'}</td>
                            <td className="p-3 border-r border-slate-200 max-w-xs break-words">{rec.fullAddress || '-'}</td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex flex-col gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openModal('direct-add-customer', rec)}
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded transition-colors"
                                >
                                  To Customer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openModal('edit-garbage', entry)}
                                  title="Edit archived record"
                                  aria-label="Edit archived record"
                                  className="px-3 py-1.5 border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold rounded transition-colors inline-flex items-center justify-center gap-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyGarbage(entry)}
                                  className="px-3 py-1.5 border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold rounded transition-colors"
                                >
                                  Copy
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        }
      </main >

      {/* Action Confirmation Popup Modal (PIN or End Date) */}
      {
        modal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <div
              className={`relative bg-white border border-slate-200 rounded-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto ${
                modal.type === 'direct-add-customer' ||
                modal.type === 'direct-add-order' ||
                modal.type === 'edit-customer' ||
                modal.type === 'edit-order' ||
                modal.type === 'edit-garbage'
                  ? 'max-w-lg'
                  : 'max-w-sm'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close popup"
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <h3 className="text-lg font-black text-slate-900 font-serif italic mb-1 pr-6">
                {modal.type === 'remove-order' && 'Confirm Remove Order'}
                {modal.type === 'add-customer' && 'Add To Customers'}
                {modal.type === 'direct-add-order' && 'Add Order'}
                {modal.type === 'direct-add-customer' && 'Add Customer'}
                {modal.type === 'edit-customer' && 'Edit Customer'}
                {modal.type === 'edit-order' && 'Edit Order'}
                {modal.type === 'edit-garbage' && 'Edit Garbage Record'}
                {(modal.type === 'confirm-add-customer' || modal.type === 'confirm-direct-customer') && 'Confirm Customer Payment'}
                {modal.type === 'add-days' && 'Extend Package Days'}
                {modal.type === 'confirm-paid' && 'Activate Customer Plan'}
                {modal.type === 'delete-customer' && 'Confirm Delete Customer'}
              </h3>
              {modal.item && (
                <p className="text-xs text-slate-500 mb-4">
                  {modal.item?.custName} ({modal.item?.orderId || modal.item?.customerId})
                </p>
              )}

              <form onSubmit={handleModalSubmit} className="space-y-4">
                {(modal.type === 'direct-add-customer' ||
                  modal.type === 'direct-add-order' ||
                  modal.type === 'edit-customer' ||
                  modal.type === 'edit-order' ||
                  modal.type === 'edit-garbage') && (
                <div className="space-y-3 mt-3">
                  {/* Two Options: Insert with Phone (from Garbage) OR Manual Details */}
                  {modal.type !== 'edit-customer' && modal.type !== 'edit-order' && modal.type !== 'edit-garbage' && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDirectMode('phone')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                        directMode === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Insert with Phone
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectMode('manual')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                        directMode === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Manual Details
                    </button>
                  </div>
                  )}

                  {modal.type !== 'edit-customer' &&
                    modal.type !== 'edit-order' &&
                    modal.type !== 'edit-garbage' &&
                    directMode === 'phone' && (
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">
                        Phone Number (Fetch from Garbage)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={lookupPhone}
                          onChange={(e) => setLookupPhone(e.target.value)}
                          placeholder="Enter 10-digit phone"
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleFetchFromGarbage}
                          className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                        >
                          Fetch
                        </button>
                      </div>
                      {lookupStatus && (
                        <p className="text-[11px] text-slate-700 font-medium">{lookupStatus}</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Name *</label>
                      <input
                        type="text"
                        required
                        value={directForm.custName}
                        onChange={(e) => setDirectForm({ ...directForm, custName: e.target.value })}
                        placeholder="Customer Name"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Phone *</label>
                      <input
                        type="tel"
                        required
                        value={directForm.custWhatsApp}
                        onChange={(e) => setDirectForm({ ...directForm, custWhatsApp: e.target.value })}
                        placeholder="10-digit phone"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={directForm.custEmail}
                      onChange={(e) => setDirectForm({ ...directForm, custEmail: e.target.value })}
                      placeholder="customer@gmail.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Plan *</label>
                      <select
                        value={directForm.packageName}
                        onChange={(e) => setDirectForm({ ...directForm, packageName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none bg-white"
                      >
                        <option value="Only Lunch - Pure Veg">Only Lunch - Pure Veg</option>
                        <option value="Only Lunch - Non-Veg">Only Lunch - Non-Veg</option>
                        <option value="Only Dinner (Pure Veg)">Only Dinner (Pure Veg)</option>
                        <option value="Only Tiffen (Pure Veg)">Only Tiffen (Pure Veg)</option>
                        <option value="Weekend Saturday Sunday Combo">Weekend Saturday Sunday Combo</option>
                        <option value="Daily & Monthly Combo - Pure Veg">Daily &amp; Monthly Combo - Pure Veg</option>
                        <option value="Daily & Monthly Combo - Non-Veg">Daily &amp; Monthly Combo - Non-Veg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Area</label>
                      <input
                        type="text"
                        value={directForm.deliveryArea}
                        onChange={(e) => setDirectForm({ ...directForm, deliveryArea: e.target.value })}
                        placeholder="Guduvancherry"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Start Date *</label>
                      <input
                        type="date"
                        required
                        value={directForm.startDate}
                        onChange={(e) => setDirectForm({ ...directForm, startDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                      />
                    </div>
                    {(modal.type === 'direct-add-customer' || modal.type === 'edit-customer' || modal.type === 'edit-garbage') && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          End Date {modal.type === 'direct-add-customer' ? '*' : ''}
                        </label>
                        <input
                          type="date"
                          required={modal.type === 'direct-add-customer'}
                          min={modal.type === 'edit-customer' || modal.type === 'edit-garbage' ? undefined : (directForm.startDate || todayStr)}
                          value={directForm.endDate}
                          onChange={(e) => setDirectForm({ ...directForm, endDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {(modal.type === 'edit-customer' || modal.type === 'edit-order' || modal.type === 'edit-garbage') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Time Slot</label>
                        <input
                          type="text"
                          value={directForm.deliveryTimeSlot}
                          onChange={(e) => setDirectForm({ ...directForm, deliveryTimeSlot: e.target.value })}
                          placeholder="Time Slot"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notes</label>
                        <input
                          type="text"
                          value={directForm.specialNotes}
                          onChange={(e) => setDirectForm({ ...directForm, specialNotes: e.target.value })}
                          placeholder="Special notes"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Address</label>
                    <input
                      type="text"
                      value={directForm.fullAddress}
                      onChange={(e) => setDirectForm({ ...directForm, fullAddress: e.target.value })}
                      placeholder="Full delivery address"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none"
                    />
                    {(() => {
                      const excludeId =
                        modal.item?.customerId || modal.item?.orderId || modal.item?.garbageId || null;
                      const addrMatch = findMatchingAddressRecord(directForm.fullAddress, excludeId);
                      if (!addrMatch) return null;
                      return (
                        <p className="mt-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-1.5">
                          Warning: This address may exist already ({addrMatch.custName} - {addrMatch.custWhatsApp} in {addrMatch._source}).
                        </p>
                      );
                    })()}
                  </div>

                  {modal.type === 'direct-add-customer' && (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowCustomItemForm((prev) => !prev)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors"
                      >
                        {showCustomItemForm ? 'Hide Custom Item' : '+ Custom'}
                      </button>

                      {showCustomItemForm && (
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                          <div className="text-[11px] font-bold text-slate-700 uppercase">Add Custom Bill Item</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={customItemName}
                              onChange={(e) => setCustomItemName(e.target.value)}
                              placeholder="Item Name (e.g. Delivery)"
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customItemAmount}
                              onChange={(e) => setCustomItemAmount(e.target.value)}
                              placeholder="Amount (Rs.)"
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleAddCustomItem}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                          >
                            Add Item
                          </button>

                          {customItems.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-slate-200">
                              {customItems.map((ci, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-slate-800 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                                  <span className="font-semibold">{ci.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">₹{ci.amount.toFixed(2)}</span>
                                    <button
                                      type="button"
                                      onClick={() => setCustomItems((prev) => prev.filter((_, i) => i !== idx))}
                                      className="text-red-600 font-bold hover:text-red-800"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {modal.type === 'add-customer' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                        Customer Email (for Activation Bill)
                      </label>
                      <input
                        type="email"
                        value={modalEmail}
                        onChange={(e) => setModalEmail(e.target.value)}
                        placeholder="customer@gmail.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 text-sm outline-none"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex justify-between mb-3">
                        <span className="font-semibold">Start Date:</span>
                        <span className="font-bold text-slate-900">{modal.item?.deliveryDate || todayStr}</span>
                      </div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                        End Date *
                      </label>
                      <input
                        type="date"
                        required
                        autoFocus
                        min={modal.item?.deliveryDate || todayStr}
                        value={modalEndDate}
                        onChange={(e) => setModalEndDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 text-sm outline-none"
                      />
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowCustomItemForm((prev) => !prev)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors"
                      >
                        {showCustomItemForm ? 'Hide Custom Item' : '+ Custom'}
                      </button>
                    </div>

                    {showCustomItemForm && (
                      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                        <div className="text-[11px] font-bold text-slate-700 uppercase">Add Custom Bill Item</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            placeholder="Item Name (e.g. Delivery)"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={customItemAmount}
                            onChange={(e) => setCustomItemAmount(e.target.value)}
                            placeholder="Amount (Rs.)"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCustomItem}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                        >
                          Add Item
                        </button>

                        {customItems.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-slate-200">
                            {customItems.map((ci, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-800 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                                <span className="font-semibold">{ci.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">₹{ci.amount.toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setCustomItems((prev) => prev.filter((_, i) => i !== idx))}
                                    className="text-red-600 font-bold hover:text-red-800"
                                  >
                                    &times;
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(modal.type === 'confirm-add-customer' || modal.type === 'confirm-direct-customer') && pendingAddPayload?.bill && (
                  <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-700">
                        <span>{pendingAddPayload.bill.planName} ({pendingAddPayload.bill.validityDays}d &times; ₹{pendingAddPayload.bill.unitPrice})</span>
                        <span className="font-bold text-slate-900">₹{pendingAddPayload.bill.planTotal.toFixed(2)}</span>
                      </div>
                      {Array.isArray(pendingAddPayload.bill.customItems) &&
                        pendingAddPayload.bill.customItems.map((ci, idx) => (
                          <div key={idx} className="flex justify-between text-slate-700">
                            <span>Custom: {ci.name}</span>
                            <span className="font-bold text-slate-900">₹{Number(ci.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                        <span>Subtotal</span>
                        <span>₹{pendingAddPayload.bill.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>GST ({pendingAddPayload.bill.gstPercent}%)</span>
                        <span>₹{pendingAddPayload.bill.gstAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                        <span>Total Payable</span>
                        <span>₹{pendingAddPayload.bill.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      Has the customer paid the actual plan amount and custom item amount shown above? Click <strong>Paid</strong> to add them to the customer list and send the activation email.
                    </p>
                  </div>
                )}

                {modal.type === 'confirm-paid' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex justify-between">
                      <span className="font-semibold">Start Date (Today):</span>
                      <span className="font-bold text-slate-900">{todayStr}</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                        Select Duration *
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${activateDuration === 'month'
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <input
                            type="radio"
                            name="activateDuration"
                            value="month"
                            checked={activateDuration === 'month'}
                            onChange={() => setActivateDuration('month')}
                            className="sr-only"
                          />
                          <span>1 Month</span>
                        </label>

                        <label
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${activateDuration === 'week'
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <input
                            type="radio"
                            name="activateDuration"
                            value="week"
                            checked={activateDuration === 'week'}
                            onChange={() => setActivateDuration('week')}
                            className="sr-only"
                          />
                          <span>1 Week</span>
                        </label>

                        <label
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${activateDuration === 'custom'
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <input
                            type="radio"
                            name="activateDuration"
                            value="custom"
                            checked={activateDuration === 'custom'}
                            onChange={() => setActivateDuration('custom')}
                            className="sr-only"
                          />
                          <span>Custom Date</span>
                        </label>
                      </div>
                    </div>

                    {activateDuration === 'custom' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                          Select Custom End Date *
                        </label>
                        <input
                          type="date"
                          required
                          min={todayStr}
                          value={modalEndDate}
                          onChange={(e) => setModalEndDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 text-sm outline-none"
                        />
                      </div>
                    )}

                    <div className="text-xs text-slate-600 flex justify-between px-1">
                      <span>New End Date:</span>
                      <span className="font-bold text-slate-900">
                        {computeDurationEndDate(activateDuration) || '-'}
                      </span>
                    </div>
                  </div>
                )}

                {modal.type === 'add-days' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-600 text-center">
                      Current End Date: <span className="font-bold text-slate-900">{modal.item?.endDate}</span>
                    </div>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => setModalDays((d) => Math.max(1, d - 1))}
                        className="w-10 h-10 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-900 font-black text-lg flex items-center justify-center"
                      >
                        -
                      </button>
                      <div className="w-16 text-center font-black text-2xl text-slate-900 select-none">
                        {modalDays}
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalDays((d) => d + 1)}
                        className="w-10 h-10 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-900 font-black text-lg flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-xs text-center text-slate-600">
                      New End Date:{' '}
                      <span className="font-bold text-slate-900">
                        {computeAddedEndDate(modal.item?.endDate, modalDays)}
                      </span>
                    </div>
                  </div>
                )}

                {(modal.type === 'remove-order' ||
                  modal.type === 'confirm-paid' ||
                  modal.type === 'delete-customer' ||
                  modal.type === 'edit-customer' ||
                  modal.type === 'edit-order' ||
                  modal.type === 'edit-garbage') && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                        Enter Secret PIN *
                      </label>
                      <input
                        type="password"
                        required
                        autoFocus={
                          modal.type === 'remove-order' ||
                          modal.type === 'confirm-paid' ||
                          modal.type === 'delete-customer'
                        }
                        value={modalPin}
                        onChange={(e) => setModalPin(e.target.value)}
                        placeholder="Enter PIN"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 text-sm outline-none text-center tracking-widest font-bold"
                      />
                    </div>
                  )}

                {modalError && (
                  <p className="text-xs text-red-600 font-semibold">{modalError}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {modal.type === 'confirm-add-customer' || modal.type === 'confirm-direct-customer' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setModal({
                          type: modal.type === 'confirm-direct-customer' ? 'direct-add-customer' : 'add-customer',
                          item: modal.item
                        })
                      }
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={modalBusy}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {modalBusy
                      ? 'Saving...'
                      : modal.type === 'confirm-add-customer' || modal.type === 'confirm-direct-customer'
                        ? 'Paid'
                        : modal.type === 'add-customer' || modal.type === 'direct-add-customer'
                          ? 'Next'
                          : modal.type === 'direct-add-order'
                            ? 'Add Order'
                            : modal.type === 'edit-customer' || modal.type === 'edit-order' || modal.type === 'edit-garbage'
                              ? 'Save Changes'
                              : 'Confirm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Bill Preview Modal (Print / Save PDF / Close) */}
      <BillModal bill={activeBill} onClose={() => setActiveBill(null)} />

      {/* Duplicate Customer Phone Alert Popup */}
      {duplicateAlert && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDuplicateAlert('')}
        >
          <div
            className="relative bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDuplicateAlert('')}
              aria-label="Close alert"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 p-1 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <h3 className="text-lg font-black text-slate-900 font-serif italic">Already Exists</h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{duplicateAlert}</p>
            <button
              type="button"
              onClick={() => setDuplicateAlert('')}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div >
  );
}
