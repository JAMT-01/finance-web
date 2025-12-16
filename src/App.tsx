import { useState, useEffect } from 'react';
import * as Icon from 'react-feather';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

// Types
interface Transaction {
  id: string;
  icon: string;
  label: string;
  amount: number;
  date?: Date | null;
}

interface Category {
  id: string;
  label: string;
  value: number;
  color: string;
  icon: string;
}

interface PendingItem {
  id: string;
  description: string;
  price: number;
  date?: string | null;
  category?: string;
  categoryIcon?: string;
}

// Constants
const TRANSACTIONS_CACHE_KEY = 'pf_transactions_v1';
const GEMINI_API_KEY_STORAGE = 'pf_gemini_api_key';
const ITEMS_PER_PAGE = 25;

// Default summary values (now calculated dynamically from transactions)

const categories: Category[] = [
  { id: 'utilities-bills', label: 'Utilities & Bills', value: 35, color: '#1f6f4d', icon: 'Zap' },
  { id: 'food-dining', label: 'Food & Dining', value: 19, color: '#2d9b6e', icon: 'Coffee' },
  { id: 'transportation', label: 'Transportation', value: 10, color: '#4db88a', icon: 'Truck' },
  { id: 'shopping-clothing', label: 'Shopping & Clothing', value: 0, color: '#7fcba4', icon: 'ShoppingBag' },
  { id: 'health-wellness', label: 'Health & Wellness', value: 0, color: '#a8d9be', icon: 'Heart' },
  { id: 'recreation-entertainment', label: 'Recreation & Entertainment', value: 7, color: '#3a8f5c', icon: 'Film' },
  { id: 'financial-obligations', label: 'Financial Obligations', value: 0, color: '#165c3e', icon: 'CreditCard' },
  { id: 'savings-investments', label: 'Savings & Investments', value: 0, color: '#0d4a2f', icon: 'TrendingUp' },
  { id: 'miscellaneous-other', label: 'Miscellaneous / Other', value: 29, color: '#b5dcc5', icon: 'MoreHorizontal' },
];

const formatCurrency = (amount: number) =>
  `$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatChange = (amount: number) => `${amount >= 0 ? '+' : ''}${formatCurrency(amount)}`;

// Format input amount with thousand separators for display
const formatAmountInput = (value: string): string => {
  if (!value) return '';
  const parts = value.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length === 2) {
    return intPart + '.' + parts[1];
  }
  return intPart;
};

// Parse formatted amount back to number string
const parseAmountInput = (value: string): string => {
  return value.replace(/,/g, '');
};

const formatShortDate = (d: Date) => {
  try {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
};

// Convert icon name from various formats to PascalCase for react-feather
const normalizeIconName = (name: string): string => {
  if (!name) return 'ShoppingBag';

  // Map common lowercase/kebab-case names to PascalCase
  const iconMap: Record<string, string> = {
    'shopping-bag': 'ShoppingBag',
    'shoppingbag': 'ShoppingBag',
    'dollar-sign': 'DollarSign',
    'dollarsign': 'DollarSign',
    'credit-card': 'CreditCard',
    'creditcard': 'CreditCard',
    'trending-up': 'TrendingUp',
    'trendingup': 'TrendingUp',
    'more-horizontal': 'MoreHorizontal',
    'morehorizontal': 'MoreHorizontal',
    'arrow-down-left': 'ArrowDownLeft',
    'arrow-up-right': 'ArrowUpRight',
    'log-out': 'LogOut',
    'edit-3': 'Edit3',
    'trash-2': 'Trash2',
    'check-circle': 'CheckCircle',
    'x-circle': 'XCircle',
    'alert-circle': 'AlertCircle',
    'external-link': 'ExternalLink',
    'chevron-up': 'ChevronUp',
    'chevron-down': 'ChevronDown',
    'chevron-left': 'ChevronLeft',
    'chevron-right': 'ChevronRight',
    'eye-off': 'EyeOff',
    'pie-chart': 'PieChart',
    'home': 'Home',
    'coffee': 'Coffee',
    'truck': 'Truck',
    'heart': 'Heart',
    'film': 'Film',
    'zap': 'Zap',
    'target': 'Target',
    'cpu': 'Cpu',
    'info': 'Info',
    'link': 'Link',
    'mail': 'Mail',
    'lock': 'Lock',
    'eye': 'Eye',
    'x': 'X',
    'plus': 'Plus',
    'camera': 'Camera',
    'calendar': 'Calendar',
    'settings': 'Settings',
  };

  const lowerName = name.toLowerCase().replace(/-/g, '');
  if (iconMap[name.toLowerCase()]) return iconMap[name.toLowerCase()];
  if (iconMap[lowerName]) return iconMap[lowerName];

  // If already PascalCase, return as is
  if (name[0] === name[0].toUpperCase()) return name;

  // Convert to PascalCase
  return name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
};

// Icon component helper
const FeatherIcon = ({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const normalizedName = normalizeIconName(name);
  const IconComponent = (Icon as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[normalizedName];
  if (!IconComponent) {
    // Fallback to ShoppingBag if icon not found
    return <Icon.ShoppingBag size={size} color={color} />;
  }
  return <IconComponent size={size} color={color} />;
};

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);

  // Password strength
  interface PasswordChecks {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    numbers: boolean;
    special: boolean;
  }

  const getPasswordStrength = (password: string): { score: number; label: string; color: string; checks: PasswordChecks } => {
    const emptyChecks: PasswordChecks = { length: false, lowercase: false, uppercase: false, numbers: false, special: false };
    if (!password) return { score: 0, label: '', color: '#e0e0e0', checks: emptyChecks };

    let score = 0;
    const checks: PasswordChecks = {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      numbers: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    if (checks.length) score++;
    if (checks.lowercase) score++;
    if (checks.uppercase) score++;
    if (checks.numbers) score++;
    if (checks.special) score++;

    if (score <= 1) return { score: 1, label: 'Very Weak', color: '#c73c3c', checks };
    if (score === 2) return { score: 2, label: 'Weak', color: '#e67e22', checks };
    if (score === 3) return { score: 3, label: 'Medium', color: '#f1c40f', checks };
    if (score === 4) return { score: 4, label: 'Strong', color: '#27ae60', checks };
    return { score: 5, label: 'Very Strong', color: '#1f6f4d', checks };
  };

  const passwordStrength = getPasswordStrength(authPassword);

  // App state
  const [isFabMenuOpen, setFabMenuOpen] = useState(false);
  const [isOcrModalVisible, setOcrModalVisible] = useState(false);
  const [isOcrLoading, setOcrLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [transactionsList, setTransactionsList] = useState<Transaction[]>([]);
  const [isManualModalVisible, setManualModalVisible] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategoryId, setManualCategoryId] = useState<string | null>(null);
  const [isCategoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [manualDate, setManualDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'expenses' | 'overview' | 'budget'>('expenses');

  // Settings & Gemini API
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [isApiKeySaved, setApiKeySaved] = useState(false);

  // Mercado Pago forwarding email
  const [forwardingEmailCopied, setForwardingEmailCopied] = useState(false);

  // Generate forwarding email from user ID (matches backend pattern: user_{external_id}@jamty.xyz)
  const forwardingEmail = user ? `user_${user.id.slice(0, 8)}@jamty.xyz` : null;

  const copyForwardingEmail = async () => {
    if (!forwardingEmail) return;
    try {
      await navigator.clipboard.writeText(forwardingEmail);
      setForwardingEmailCopied(true);
      setTimeout(() => setForwardingEmailCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
      alert('Failed to copy. Please copy manually.');
    }
  };

  // All expenses modal
  const [isAllExpensesModalVisible, setAllExpensesModalVisible] = useState(false);

  // Pagination
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Desktop detection for responsive layout
  const [isDesktop, setIsDesktop] = useState(false);

  // Desktop detection listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Auth listener
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignUp = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Please enter email and password');
      return;
    }

    if (passwordStrength.score < 3) {
      setAuthError('Password is too weak. Include uppercase, lowercase, numbers, and be at least 8 characters.');
      return;
    }

    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }

    if (!supabase) return;

    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });

      if (error) throw error;

      if (data?.user?.identities?.length === 0) {
        if (window.confirm('An account with this email already exists. Would you like to sign in instead?')) {
          setAuthScreen('login');
          setAuthConfirmPassword('');
          setShowConfirmPassword(false);
        }
        return;
      }

      const signedUpEmail = authEmail;
      setAuthPassword('');
      setAuthConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setPendingConfirmationEmail(signedUpEmail);
      setAuthScreen('login');

      alert('Check your email! We sent a confirmation link to ' + signedUpEmail);
    } catch (error) {
      const err = error as Error;
      if (err.message?.toLowerCase().includes('already registered') ||
        err.message?.toLowerCase().includes('already exists')) {
        if (window.confirm('An account with this email already exists. Would you like to sign in instead?')) {
          setAuthScreen('login');
          setAuthConfirmPassword('');
          setShowConfirmPassword(false);
        }
        return;
      }
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Please enter email and password');
      return;
    }
    if (!supabase) return;

    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const loadTransactions = async (reset = true) => {
    try {
      if (!isSupabaseConfigured || !supabase) return;

      const offset = reset ? 0 : transactionsList.length;

      const { data, error } = await supabase
        .from('expenses')
        .select('id,label,amount,icon,transaction_at')
        .order('transaction_at', { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (error) throw error;

      const mapped = (data || []).map((row) => ({
        id: String(row.id),
        icon: row.icon || 'ShoppingBag',
        label: row.label,
        amount: Number(row.amount),
        date: row.transaction_at ? new Date(row.transaction_at) : null,
      }));

      setHasMoreTransactions(mapped.length === ITEMS_PER_PAGE);

      if (reset) {
        setTransactionsList(mapped);
      } else {
        setTransactionsList((prev) => [...prev, ...mapped]);
      }
    } catch (e) {
      console.error('Load transactions error', e);
    }
  };

  const loadMoreTransactions = async () => {
    if (isLoadingMore || !hasMoreTransactions) return;

    setIsLoadingMore(true);
    try {
      await loadTransactions(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      setTransactionsList((prev) => prev.filter((item) => item.id !== expenseId));

      if (isSupabaseConfigured && supabase && user) {
        const { error } = await supabase
          .from('expenses')
          .delete()
          .eq('id', expenseId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Delete expense error:', error);
        }
      }
    } catch (e) {
      console.error('Delete expense error:', e);
    }
  };

  const loadCachedTransactions = () => {
    try {
      const json = localStorage.getItem(TRANSACTIONS_CACHE_KEY);
      if (json) {
        const cached = JSON.parse(json);
        if (Array.isArray(cached)) {
          setTransactionsList(cached.map((t: Transaction) => ({
            ...t,
            date: t.date ? new Date(t.date) : null,
          })));
        }
      }
    } catch (e) {
      console.error('Load transactions cache error', e);
    }
  };

  useEffect(() => {
    loadCachedTransactions();
  }, []);

  // Load Gemini API key when user changes (login/logout)
  useEffect(() => {
    loadGeminiApiKey();
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTransactions();
    } else {
      setTransactionsList([]);
      setHasMoreTransactions(true);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(transactionsList));
  }, [transactionsList]);

  const loadGeminiApiKey = async () => {
    try {
      // First try to load from Supabase if user is logged in
      if (isSupabaseConfigured && supabase && user) {
        const { data, error } = await supabase
          .from('user_settings')
          .select('gemini_api_key')
          .eq('user_id', user.id)
          .single();

        if (!error && data?.gemini_api_key) {
          setGeminiApiKey(data.gemini_api_key);
          setGeminiApiKeyInput(data.gemini_api_key);
          setApiKeySaved(true);
          // Also cache locally
          localStorage.setItem(GEMINI_API_KEY_STORAGE, data.gemini_api_key);
          return;
        }
      }

      // Fallback to localStorage
      const savedKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
      if (savedKey) {
        setGeminiApiKey(savedKey);
        setGeminiApiKeyInput(savedKey);
        setApiKeySaved(true);
      }
    } catch (e) {
      console.error('Load Gemini API key error', e);
      // Fallback to localStorage on error
      const savedKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
      if (savedKey) {
        setGeminiApiKey(savedKey);
        setGeminiApiKeyInput(savedKey);
        setApiKeySaved(true);
      }
    }
  };

  const saveGeminiApiKey = async () => {
    try {
      const trimmedKey = geminiApiKeyInput.trim();

      // Save to Supabase if user is logged in
      if (isSupabaseConfigured && supabase && user) {
        const { error } = await supabase
          .from('user_settings')
          .upsert({
            user_id: user.id,
            gemini_api_key: trimmedKey,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.error('Save to Supabase error:', error);
          // Still save locally as fallback
        }
      }

      // Always save locally too (for offline access)
      localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmedKey);
      setGeminiApiKey(trimmedKey);
      setApiKeySaved(true);
      alert('API key saved successfully!');
    } catch (e) {
      console.error('Save Gemini API key error', e);
      alert('Failed to save API key');
    }
  };

  const clearGeminiApiKey = async () => {
    try {
      // Remove from Supabase if user is logged in
      if (isSupabaseConfigured && supabase && user) {
        await supabase
          .from('user_settings')
          .update({ gemini_api_key: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }

      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      setGeminiApiKey('');
      setGeminiApiKeyInput('');
      setApiKeySaved(false);
      alert('API key removed');
    } catch (e) {
      console.error('Clear Gemini API key error', e);
    }
  };

  // Category mapping for OCR
  const categoryMapping: Record<string, { icon: string; label: string }> = {
    'utilities-bills': { icon: 'Zap', label: 'Utilities & Bills' },
    'food-dining': { icon: 'Coffee', label: 'Food & Dining' },
    'transportation': { icon: 'Truck', label: 'Transportation' },
    'shopping-clothing': { icon: 'ShoppingBag', label: 'Shopping & Clothing' },
    'health-wellness': { icon: 'Heart', label: 'Health & Wellness' },
    'recreation-entertainment': { icon: 'Film', label: 'Recreation & Entertainment' },
    'financial-obligations': { icon: 'CreditCard', label: 'Financial Obligations' },
    'savings-investments': { icon: 'TrendingUp', label: 'Savings & Investments' },
    'miscellaneous-other': { icon: 'MoreHorizontal', label: 'Miscellaneous / Other' },
  };

  const scanReceiptWithGemini = async (base64Image: string) => {
    if (!geminiApiKey) {
      throw new Error('Please add your Gemini API key in Settings first');
    }

    const categoryList = Object.entries(categoryMapping)
      .map(([id, cat]) => `- ${id}: ${cat.label}`)
      .join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this receipt image and extract all purchased items.

For each item, classify it into ONE of these expense categories:
${categoryList}

Return ONLY a valid JSON object with this format:
{
  "date": "YYYY-MM-DD",
  "items": [
    {"description": "Coffee", "price": 4.50, "category": "food-dining"},
    {"description": "Gas", "price": 45.00, "category": "transportation"}
  ]
}

Rules:
- "date": Extract receipt date (YYYY-MM-DD format). Use null if not found.
- "description": Short item name from receipt
- "price": Numeric price (no currency symbol)
- "category": Must be one of the category IDs listed above. Use "miscellaneous-other" if unsure.

Category guidelines:
- Food, groceries, restaurants, snacks, drinks → food-dining
- Gas, uber, taxi, parking, car services → transportation
- Electricity, water, internet, phone bills → utilities-bills
- Clothes, shoes, accessories, electronics → shopping-clothing
- Gym, medicine, pharmacy, doctor → health-wellness
- Movies, games, streaming, hobbies → recreation-entertainment
- Bank fees, loans, insurance payments → financial-obligations
- Anything else → miscellaneous-other`,
              },
              { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : textContent;

    try {
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const receiptDate = parsed.date || null;

      return {
        date: receiptDate,
        items: items.map((item: { description?: string; price?: number; category?: string }, index: number) => {
          const categoryId = item.category && categoryMapping[item.category] ? item.category : 'miscellaneous-other';
          const categoryInfo = categoryMapping[categoryId];
          return {
            id: `ocr-${Date.now()}-${index}`,
            description: item.description || 'Item',
            price: Number(item.price) || 0,
            category: categoryId,
            categoryIcon: categoryInfo.icon,
          };
        }),
      };
    } catch {
      throw new Error('Could not parse receipt items. Please try again.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!geminiApiKey) {
      alert('Please add your Gemini API key in Settings first');
      setSettingsModalVisible(true);
      return;
    }

    setOcrError(null);
    setOcrLoading(true);
    setOcrModalVisible(true);
    setPendingItems([]);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const ocrResult = await scanReceiptWithGemini(base64);

      if (ocrResult.items.length > 0) {
        const itemsWithDate = ocrResult.items.map((item: PendingItem) => ({
          ...item,
          date: ocrResult.date,
        }));
        setPendingItems(itemsWithDate);
      } else {
        setOcrError('No items detected. Try uploading a clearer image.');
      }
    } catch (error) {
      console.error('OCR error', error);
      setOcrError((error as Error).message || 'Unable to parse receipt.');
    } finally {
      setOcrLoading(false);
    }
  };

  const addManualExpense = async () => {
    const amountNumber = Number(manualAmount);
    if (!isFinite(amountNumber)) {
      alert('Please enter a valid amount.');
      return;
    }

    const normalized = -Math.abs(amountNumber);
    const selectedCategory = categories.find(c => c.id === manualCategoryId);
    const categoryIcon = selectedCategory?.icon || 'ShoppingBag';

    const fallbackInsert = () => {
      const newItem: Transaction = {
        id: `${Date.now()}`,
        icon: categoryIcon,
        label: manualDescription.trim() || 'Transaction',
        amount: normalized,
        date: manualDate,
      };
      setTransactionsList((prev) => {
        const merged = [newItem, ...prev];
        merged.sort((a, b) => {
          const dateA = a.date ? new Date(a.date) : new Date(0);
          const dateB = b.date ? new Date(b.date) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        return merged;
      });
    };

    if (isSupabaseConfigured && supabase && user) {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            label: manualDescription.trim() || 'Transaction',
            amount: normalized,
            icon: categoryIcon,
            category_id: manualCategoryId || null,
            transaction_at: manualDate?.toISOString?.() || null,
          })
          .select('id,label,amount,icon,transaction_at')
          .single();

        if (error) throw error;

        const newItem: Transaction = {
          id: String(data.id),
          icon: data.icon || categoryIcon,
          label: data.label,
          amount: Number(data.amount),
          date: data.transaction_at ? new Date(data.transaction_at) : manualDate,
        };

        setTransactionsList((prev) => {
          const merged = [newItem, ...prev];
          merged.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          return merged;
        });
      } catch (e) {
        console.error('Insert transaction error', e);
        alert('Save failed. Saving locally instead.');
        fallbackInsert();
      }
    } else {
      fallbackInsert();
    }

    setManualDescription('');
    setManualAmount('');
    setManualCategoryId(null);
    setManualDate(new Date());
    setCategoryPickerOpen(false);
    setDatePickerVisible(false);
    setManualModalVisible(false);
  };

  const addOcrExpenses = async () => {
    const newTransactions: Transaction[] = pendingItems.map((item) => {
      const transactionDate = item.date ? new Date(item.date + 'T12:00:00') : new Date();
      return {
        id: `${Date.now()}-${item.description}`,
        icon: item.categoryIcon || 'ShoppingBag',
        label: item.description,
        amount: -Math.abs(item.price),
        date: transactionDate,
      };
    });

    if (isSupabaseConfigured && supabase && user) {
      try {
        const inserts = pendingItems.map((item) => {
          const transactionDate = item.date ? new Date(item.date + 'T12:00:00') : new Date();
          return {
            user_id: user.id,
            label: item.description,
            amount: -Math.abs(item.price),
            icon: item.categoryIcon || 'ShoppingBag',
            transaction_at: transactionDate.toISOString(),
          };
        });

        const { data, error } = await supabase
          .from('expenses')
          .insert(inserts)
          .select('id,label,amount,icon,transaction_at');

        if (error) throw error;

        const savedTransactions = (data || []).map((row) => ({
          id: String(row.id),
          icon: row.icon || 'ShoppingBag',
          label: row.label,
          amount: Number(row.amount),
          date: row.transaction_at ? new Date(row.transaction_at) : new Date(),
        }));

        setTransactionsList((prev) => {
          const merged = [...savedTransactions, ...prev];
          merged.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          return merged;
        });
      } catch (e) {
        console.error('Save OCR items error', e);
        setTransactionsList((prev) => {
          const merged = [...newTransactions, ...prev];
          merged.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          return merged;
        });
      }
    } else {
      setTransactionsList((prev) => {
        const merged = [...newTransactions, ...prev];
        merged.sort((a, b) => {
          const dateA = a.date ? new Date(a.date) : new Date(0);
          const dateB = b.date ? new Date(b.date) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        return merged;
      });
    }

    setPendingItems([]);
    setOcrModalVisible(false);
  };

  // Loading screen
  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <span className="loading-text">Loading...</span>
      </div>
    );
  }

  // Auth screen
  if (!user && isSupabaseConfigured) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo-circle">
              <Icon.DollarSign size={32} color="#1f6f4d" />
            </div>
            <h1 className="auth-title">Personal Finance</h1>
            <p className="auth-subtitle">
              {authScreen === 'login' ? 'Welcome back!' : 'Create your account'}
            </p>
          </div>

          {pendingConfirmationEmail && authScreen === 'login' && (
            <div className="auth-success-box">
              <div className="auth-success-icon-wrap">
                <Icon.Mail size={20} color="#1f6f4d" />
              </div>
              <div className="auth-success-content">
                <div className="auth-success-title">Confirmation email sent!</div>
                <div className="auth-success-text">
                  Check your inbox at {pendingConfirmationEmail}
                </div>
              </div>
              <button
                className="auth-success-dismiss"
                onClick={() => setPendingConfirmationEmail(null)}
              >
                <Icon.X size={16} color="#5b7a63" />
              </button>
            </div>
          )}

          {authError && (
            <div className="auth-error-box">
              <Icon.AlertCircle size={16} color="#c73c3c" />
              <span className="auth-error-text">{authError}</span>
            </div>
          )}

          <div className="auth-form">
            <div className="auth-input-group">
              <label className="auth-input-label">Email</label>
              <div className="auth-input-wrap">
                <Icon.Mail size={18} className="auth-input-icon" />
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-input-group">
              <label className="auth-input-label">Password</label>
              <div className="auth-input-wrap">
                <Icon.Lock size={18} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    setAuthError(null);
                  }}
                  autoComplete={authScreen === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <Icon.EyeOff size={18} /> : <Icon.Eye size={18} />}
                </button>
              </div>

              {authScreen === 'signup' && authPassword.length > 0 && (
                <>
                  <div className="password-strength-container">
                    <div className="password-strength-bar">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className="password-strength-segment"
                          style={{
                            backgroundColor: level <= passwordStrength.score
                              ? passwordStrength.color
                              : '#e0e0e0',
                          }}
                        />
                      ))}
                    </div>
                    <span className="password-strength-label" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>

                  {passwordStrength.score < 3 && (
                    <div className="password-requirements">
                      <div className="password-requirement-row">
                        {passwordStrength.checks.length ? <Icon.CheckCircle size={12} color="#27ae60" /> : <Icon.Circle size={12} color="#a8b5ad" />}
                        <span className={`password-requirement-text ${passwordStrength.checks.length ? 'met' : ''}`}>At least 8 characters</span>
                      </div>
                      <div className="password-requirement-row">
                        {passwordStrength.checks.uppercase ? <Icon.CheckCircle size={12} color="#27ae60" /> : <Icon.Circle size={12} color="#a8b5ad" />}
                        <span className={`password-requirement-text ${passwordStrength.checks.uppercase ? 'met' : ''}`}>Uppercase letter</span>
                      </div>
                      <div className="password-requirement-row">
                        {passwordStrength.checks.lowercase ? <Icon.CheckCircle size={12} color="#27ae60" /> : <Icon.Circle size={12} color="#a8b5ad" />}
                        <span className={`password-requirement-text ${passwordStrength.checks.lowercase ? 'met' : ''}`}>Lowercase letter</span>
                      </div>
                      <div className="password-requirement-row">
                        {passwordStrength.checks.numbers ? <Icon.CheckCircle size={12} color="#27ae60" /> : <Icon.Circle size={12} color="#a8b5ad" />}
                        <span className={`password-requirement-text ${passwordStrength.checks.numbers ? 'met' : ''}`}>Number</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {authScreen === 'signup' && (
              <div className="auth-input-group">
                <label className="auth-input-label">Confirm Password</label>
                <div className="auth-input-wrap">
                  <Icon.Lock size={18} className="auth-input-icon" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={authConfirmPassword}
                    onChange={(e) => {
                      setAuthConfirmPassword(e.target.value);
                      setAuthError(null);
                    }}
                    autoComplete="new-password"
                  />
                  <button
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    type="button"
                  >
                    {showConfirmPassword ? <Icon.EyeOff size={18} /> : <Icon.Eye size={18} />}
                  </button>
                </div>
                {authConfirmPassword.length > 0 && (
                  <div className="password-match-container">
                    {authPassword === authConfirmPassword
                      ? <Icon.CheckCircle size={14} color="#27ae60" />
                      : <Icon.XCircle size={14} color="#c73c3c" />
                    }
                    <span className="password-match-text" style={{ color: authPassword === authConfirmPassword ? '#27ae60' : '#c73c3c' }}>
                      {authPassword === authConfirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              className="auth-button"
              onClick={authScreen === 'login' ? handleSignIn : handleSignUp}
              disabled={authSubmitting || (authScreen === 'signup' && (passwordStrength.score < 3 || authPassword !== authConfirmPassword))}
            >
              {authSubmitting ? (
                <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              ) : (
                <span className="auth-button-text">
                  {authScreen === 'login' ? 'Sign In' : 'Create Account'}
                </span>
              )}
            </button>
          </div>

          <div className="auth-footer">
            <span className="auth-footer-text">
              {authScreen === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              className="auth-footer-link"
              onClick={() => {
                setAuthScreen(authScreen === 'login' ? 'signup' : 'login');
                setAuthError(null);
                setAuthConfirmPassword('');
                setShowPassword(false);
                setShowConfirmPassword(false);
                if (authScreen === 'login') {
                  setPendingConfirmationEmail(null);
                }
              }}
            >
              {authScreen === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="app-container">
      <div className="main-container" onClick={() => isFabMenuOpen && setFabMenuOpen(false)}>
        {user && (
          <div className="header-top-row">
            <button className="header-icon-button" onClick={() => setSettingsModalVisible(true)}>
              <Icon.Settings size={18} />
            </button>
            <button className="header-icon-button" onClick={handleSignOut}>
              <Icon.LogOut size={18} />
            </button>
          </div>
        )}

        {/* Mobile: Tab Bar (hidden on desktop via CSS) */}
        <div className="tab-bar">
          <button
            className={`tab-chip ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            Expenses
          </button>
          <button
            className={`tab-chip ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-chip ${activeTab === 'budget' ? 'active' : ''}`}
            onClick={() => setActiveTab('budget')}
          >
            Budget
          </button>
        </div>

        {/* Desktop Dashboard Layout - all sections visible */}
        {isDesktop ? (
          (() => {
            // Calculate date range for last month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            // Filter transactions for this month
            const monthTransactions = transactionsList.filter(t => {
              if (!t.date) return false;
              const txDate = t.date instanceof Date ? t.date : new Date(t.date);
              return txDate >= startOfMonth && txDate <= endOfMonth;
            });

            // Calculate income and expenses
            const monthIncome = monthTransactions
              .filter(t => t.amount > 0)
              .reduce((sum, t) => sum + t.amount, 0);
            const monthExpenses = Math.abs(monthTransactions
              .filter(t => t.amount < 0)
              .reduce((sum, t) => sum + t.amount, 0));

            // Calculate total balance (all time)
            const totalBalance = transactionsList.reduce((sum, t) => sum + t.amount, 0);

            // Calculate week change
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const weekTransactions = transactionsList.filter(t => {
              if (!t.date) return false;
              const txDate = t.date instanceof Date ? t.date : new Date(t.date);
              return txDate >= weekAgo && txDate <= now;
            });
            const weekChange = weekTransactions.reduce((sum, t) => sum + t.amount, 0);

            // Group expenses by icon/category for chart
            const expensesByCategory: Record<string, { amount: number; count: number; icon: string; color: string; label: string }> = {};
            const categoryColors = ['#1f6f4d', '#2d9b6e', '#4db88a', '#7fcba4', '#a8d9be', '#3a8f5c', '#165c3e'];

            monthTransactions.filter(t => t.amount < 0).forEach((t) => {
              const key = t.icon || 'ShoppingBag';
              if (!expensesByCategory[key]) {
                expensesByCategory[key] = {
                  amount: 0,
                  count: 0,
                  icon: key,
                  color: categoryColors[Object.keys(expensesByCategory).length % categoryColors.length],
                  label: t.label.split(' ')[0]
                };
              }
              expensesByCategory[key].amount += Math.abs(t.amount);
              expensesByCategory[key].count += 1;
            });

            // Convert to array and calculate percentages
            const expenseData = Object.entries(expensesByCategory)
              .map(([key, data]) => ({
                id: key,
                label: data.label,
                icon: data.icon,
                color: data.color,
                amount: data.amount,
                count: data.count,
                percentage: monthExpenses > 0 ? Math.round((data.amount / monthExpenses) * 100) : 0
              }))
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 5);

            // Spending ratio
            const spendingRatio = monthIncome > 0 ? Math.min(Math.round((monthExpenses / monthIncome) * 100), 100) : 0;
            const savingsRate = monthIncome > 0 ? Math.max(100 - spendingRatio, 0) : 0;

            // Month name
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
            const currentMonthName = monthNames[now.getMonth()];

            return (
              <div className="dashboard-layout">
                {/* Balance Card - Full Width */}
                <div className="overview-balance-card">
                  <div className="overview-balance-label">Total Balance</div>
                  <div className="overview-balance-value">
                    {totalBalance < 0 ? '-' : ''}{formatCurrency(totalBalance)}
                  </div>
                  <div className="overview-balance-change">
                    {weekChange >= 0 ? <Icon.TrendingUp size={16} /> : <Icon.TrendingDown size={16} />}
                    <span>{formatChange(weekChange)} this week</span>
                  </div>
                </div>

                {/* Summary Card */}
                <div className="dashboard-summary">
                  <div className="content-card">
                    <h2 className="section-title">{currentMonthName} Summary</h2>
                    <div className="overview-stats-row">
                      <div className="overview-stat-card">
                        <div className="overview-stat-icon" style={{ backgroundColor: '#e1f3e8' }}>
                          <Icon.ArrowDownLeft size={20} color="#1f6f4d" />
                        </div>
                        <div className="overview-stat-label">Income</div>
                        <div className="overview-stat-value" style={{ color: '#1f6f4d' }}>{formatCurrency(monthIncome)}</div>
                      </div>
                      <div className="overview-stat-card">
                        <div className="overview-stat-icon" style={{ backgroundColor: '#fce8e8' }}>
                          <Icon.ArrowUpRight size={20} color="#c73c3c" />
                        </div>
                        <div className="overview-stat-label">Expenses</div>
                        <div className="overview-stat-value" style={{ color: '#c73c3c' }}>{formatCurrency(monthExpenses)}</div>
                      </div>
                    </div>

                    {monthIncome > 0 && (
                      <div className="overview-progress-container">
                        <div className="overview-progress-bar">
                          <div className="overview-progress-fill" style={{ width: `${spendingRatio}%` }} />
                        </div>
                        <div className="overview-progress-text">{spendingRatio}% of income spent</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expenses List Card */}
                <div className="dashboard-expenses">
                  <div className="content-card">
                    <div className="transactions-header">
                      <h2 className="section-title">Recent Expenses</h2>
                      {transactionsList.length > 8 && (
                        <button className="view-all" onClick={() => setAllExpensesModalVisible(true)}>
                          View all
                        </button>
                      )}
                    </div>

                    {transactionsList.length === 0 ? (
                      <p className="empty-list-text">No expenses yet. Click + to add one!</p>
                    ) : (
                      transactionsList.slice(0, 8).map((item, index) => (
                        <div key={item.id}>
                          {index > 0 && <div className="transaction-divider" />}
                          <div className="transaction-row">
                            <div className="transaction-icon-wrapper">
                              <FeatherIcon name={item.icon} size={18} />
                            </div>
                            <div className="transaction-info">
                              <div className="transaction-label">{item.label}</div>
                              {item.date && (
                                <div className="transaction-date">
                                  {formatShortDate(item.date instanceof Date ? item.date : new Date(item.date))}
                                </div>
                              )}
                            </div>
                            <span className={`transaction-amount ${item.amount >= 0 ? 'positive' : 'negative'}`}>
                              {item.amount < 0 ? '-' : ''}{formatCurrency(item.amount)}
                            </span>
                            <button className="delete-button" onClick={() => deleteExpense(item.id)}>
                              <Icon.Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* FAB inside expenses for desktop positioning */}
                  <button
                    className="fab desktop-expenses-fab"
                    onClick={() => setFabMenuOpen((prev) => !prev)}
                  >
                    {isFabMenuOpen ? <Icon.X size={28} /> : <Icon.Plus size={28} />}
                  </button>
                </div>

                {/* Chart Card */}
                <div className="dashboard-chart">
                  <div className="content-card">
                    <h2 className="section-title">{currentMonthName} Breakdown</h2>
                    {expenseData.length === 0 ? (
                      <p className="empty-list-text">No expenses this month</p>
                    ) : (
                      <div className="budget-chart-row">
                        <div className="budget-donut-container">
                          <svg width="160" height="160" viewBox="0 0 160 160">
                            <g transform="rotate(-90 80 80)">
                              {(() => {
                                const chartRadius = 72;
                                const chartStroke = 14;
                                const chartCircumference = 2 * Math.PI * (chartRadius - chartStroke / 2);
                                let accumulated = 0;

                                return expenseData.map((item) => {
                                  const segmentStart = accumulated;
                                  accumulated += item.percentage;
                                  const strokeDashoffset = chartCircumference - (segmentStart / 100) * chartCircumference;
                                  const strokeDashLength = (item.percentage / 100) * chartCircumference;

                                  return (
                                    <circle
                                      key={item.id}
                                      cx={80}
                                      cy={80}
                                      r={chartRadius - chartStroke / 2}
                                      stroke={item.color}
                                      strokeWidth={chartStroke}
                                      strokeDasharray={`${strokeDashLength} ${chartCircumference - strokeDashLength}`}
                                      strokeDashoffset={strokeDashoffset}
                                      fill="transparent"
                                    />
                                  );
                                });
                              })()}
                            </g>
                          </svg>
                          <div className="budget-donut-center">
                            <div className="budget-donut-label">Total</div>
                            <div className="budget-donut-value">{formatCurrency(monthExpenses)}</div>
                          </div>
                        </div>

                        <div className="budget-legend">
                          {expenseData.map((item) => (
                            <div key={item.id} className="budget-legend-item">
                              <div className="budget-legend-dot" style={{ backgroundColor: item.color }} />
                              <span className="budget-legend-label">{item.label}</span>
                              <span className="budget-legend-value">{item.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Insights Card */}
                <div className="dashboard-insights">
                  <div className="content-card">
                    <h2 className="section-title">Quick Insights</h2>
                    <div className="dashboard-insights-grid">
                      {expenseData.length > 0 && (
                        <div className="dashboard-insight-card">
                          <div className="overview-insight-icon" style={{ backgroundColor: expenseData[0].color }}>
                            <FeatherIcon name={expenseData[0].icon} size={20} color="#fff" />
                          </div>
                          <div className="overview-insight-content">
                            <div className="overview-insight-title">{expenseData[0].label}</div>
                            <div className="overview-insight-subtitle">Top spending</div>
                          </div>
                          <span className="overview-insight-amount">{formatCurrency(expenseData[0].amount)}</span>
                        </div>
                      )}

                      <div className="dashboard-insight-card">
                        <div className="overview-insight-icon" style={{ backgroundColor: '#1f6f4d' }}>
                          <Icon.Activity size={20} color="#fff" />
                        </div>
                        <div className="overview-insight-content">
                          <div className="overview-insight-title">Transactions</div>
                          <div className="overview-insight-subtitle">This month</div>
                        </div>
                        <span className="overview-insight-amount">{monthTransactions.length}</span>
                      </div>

                      <div className="dashboard-insight-card">
                        <div className="overview-insight-icon" style={{ backgroundColor: savingsRate >= 20 ? '#1f6f4d' : '#e67e22' }}>
                          <Icon.Target size={20} color="#fff" />
                        </div>
                        <div className="overview-insight-content">
                          <div className="overview-insight-title">Savings Rate</div>
                          <div className="overview-insight-subtitle">
                            {savingsRate >= 20 ? 'Great!' : savingsRate >= 10 ? 'Good' : 'Improve'}
                          </div>
                        </div>
                        <span className="overview-insight-amount" style={{ color: savingsRate >= 20 ? '#1f6f4d' : '#e67e22' }}>
                          {savingsRate}%
                        </span>
                      </div>

                      <div className="dashboard-insight-card">
                        <div className="overview-insight-icon" style={{ backgroundColor: '#2d9b6e' }}>
                          <Icon.Calendar size={20} color="#fff" />
                        </div>
                        <div className="overview-insight-content">
                          <div className="overview-insight-title">Daily Avg</div>
                          <div className="overview-insight-subtitle">{now.getDate()} days</div>
                        </div>
                        <span className="overview-insight-amount">
                          {formatCurrency(now.getDate() > 0 ? monthExpenses / now.getDate() : 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Budget Coming Soon */}
                <div className="dashboard-budget">
                  <div className="content-card budget-placeholder">
                    <Icon.PieChart size={48} color="#dcefe4" />
                    <h2 className="section-title">Budget Coming Soon</h2>
                    <p className="budget-placeholder-hint">Set spending limits for each category</p>
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            {/* Mobile: EXPENSES TAB */}
            {activeTab === 'expenses' && (
              <div className="content-card">
                <div className="transactions-header">
                  <h2 className="section-title">Recent Expenses</h2>
                  {transactionsList.length > 6 && (
                    <button className="view-all" onClick={() => setAllExpensesModalVisible(true)}>
                      View all
                    </button>
                  )}
                </div>

                {transactionsList.length === 0 ? (
                  <p className="empty-list-text">No expenses yet. Tap + to add one!</p>
                ) : (
                  transactionsList.slice(0, 6).map((item, index) => (
                    <div key={item.id}>
                      {index > 0 && <div className="transaction-divider" />}
                      <div className="transaction-row">
                        <div className="transaction-icon-wrapper">
                          <FeatherIcon name={item.icon} size={18} />
                        </div>
                        <div className="transaction-info">
                          <div className="transaction-label">{item.label}</div>
                          {item.date && (
                            <div className="transaction-date">
                              {formatShortDate(item.date instanceof Date ? item.date : new Date(item.date))}
                            </div>
                          )}
                        </div>
                        <span className={`transaction-amount ${item.amount >= 0 ? 'positive' : 'negative'}`}>
                          {item.amount < 0 ? '-' : ''}{formatCurrency(item.amount)}
                        </span>
                        <button className="delete-button" onClick={() => deleteExpense(item.id)}>
                          <Icon.Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Mobile: OVERVIEW TAB */}
            {activeTab === 'overview' && (
              (() => {
                // Calculate date range for last month
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

                // Filter transactions for this month
                const monthTransactions = transactionsList.filter(t => {
                  if (!t.date) return false;
                  const txDate = t.date instanceof Date ? t.date : new Date(t.date);
                  return txDate >= startOfMonth && txDate <= endOfMonth;
                });

                // Calculate income and expenses
                const monthIncome = monthTransactions
                  .filter(t => t.amount > 0)
                  .reduce((sum, t) => sum + t.amount, 0);
                const monthExpenses = Math.abs(monthTransactions
                  .filter(t => t.amount < 0)
                  .reduce((sum, t) => sum + t.amount, 0));

                // Calculate total balance (all time)
                const totalBalance = transactionsList.reduce((sum, t) => sum + t.amount, 0);

                // Calculate week change
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const weekTransactions = transactionsList.filter(t => {
                  if (!t.date) return false;
                  const txDate = t.date instanceof Date ? t.date : new Date(t.date);
                  return txDate >= weekAgo && txDate <= now;
                });
                const weekChange = weekTransactions.reduce((sum, t) => sum + t.amount, 0);

                // Group expenses by icon/category for chart
                const expensesByCategory: Record<string, { amount: number; count: number; icon: string; color: string; label: string }> = {};
                const categoryColors = ['#1f6f4d', '#2d9b6e', '#4db88a', '#7fcba4', '#a8d9be', '#3a8f5c', '#165c3e'];

                monthTransactions.filter(t => t.amount < 0).forEach((t) => {
                  const key = t.icon || 'ShoppingBag';
                  if (!expensesByCategory[key]) {
                    expensesByCategory[key] = {
                      amount: 0,
                      count: 0,
                      icon: key,
                      color: categoryColors[Object.keys(expensesByCategory).length % categoryColors.length],
                      label: t.label.split(' ')[0]
                    };
                  }
                  expensesByCategory[key].amount += Math.abs(t.amount);
                  expensesByCategory[key].count += 1;
                });

                // Convert to array and calculate percentages
                const expenseData = Object.entries(expensesByCategory)
                  .map(([key, data]) => ({
                    id: key,
                    label: data.label,
                    icon: data.icon,
                    color: data.color,
                    amount: data.amount,
                    count: data.count,
                    percentage: monthExpenses > 0 ? Math.round((data.amount / monthExpenses) * 100) : 0
                  }))
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5); // Top 5 categories

                // Spending ratio
                const spendingRatio = monthIncome > 0 ? Math.min(Math.round((monthExpenses / monthIncome) * 100), 100) : 0;
                const savingsRate = monthIncome > 0 ? Math.max(100 - spendingRatio, 0) : 0;

                // Month name
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
                const currentMonthName = monthNames[now.getMonth()];

                return (
                  <>
                    <div className="overview-balance-card">
                      <div className="overview-balance-label">Total Balance</div>
                      <div className="overview-balance-value">
                        {totalBalance < 0 ? '-' : ''}{formatCurrency(totalBalance)}
                      </div>
                      <div className="overview-balance-change">
                        {weekChange >= 0 ? <Icon.TrendingUp size={16} /> : <Icon.TrendingDown size={16} />}
                        <span>{formatChange(weekChange)} this week</span>
                      </div>
                    </div>

                    <div className="content-card">
                      <h2 className="section-title">{currentMonthName} Expenses</h2>
                      {expenseData.length === 0 ? (
                        <p className="empty-list-text">No expenses this month</p>
                      ) : (
                        <div className="budget-chart-row">
                          <div className="budget-donut-container">
                            <svg width="160" height="160" viewBox="0 0 160 160">
                              <g transform="rotate(-90 80 80)">
                                {(() => {
                                  const chartRadius = 72;
                                  const chartStroke = 14;
                                  const chartCircumference = 2 * Math.PI * (chartRadius - chartStroke / 2);
                                  let accumulated = 0;

                                  return expenseData.map((item) => {
                                    const segmentStart = accumulated;
                                    accumulated += item.percentage;
                                    const strokeDashoffset = chartCircumference - (segmentStart / 100) * chartCircumference;
                                    const strokeDashLength = (item.percentage / 100) * chartCircumference;

                                    return (
                                      <circle
                                        key={item.id}
                                        cx={80}
                                        cy={80}
                                        r={chartRadius - chartStroke / 2}
                                        stroke={item.color}
                                        strokeWidth={chartStroke}
                                        strokeDasharray={`${strokeDashLength} ${chartCircumference - strokeDashLength}`}
                                        strokeDashoffset={strokeDashoffset}
                                        fill="transparent"
                                      />
                                    );
                                  });
                                })()}
                              </g>
                            </svg>
                            <div className="budget-donut-center">
                              <div className="budget-donut-label">Total</div>
                              <div className="budget-donut-value">{formatCurrency(monthExpenses)}</div>
                            </div>
                          </div>

                          <div className="budget-legend">
                            {expenseData.map((item) => (
                              <div key={item.id} className="budget-legend-item">
                                <div className="budget-legend-dot" style={{ backgroundColor: item.color }} />
                                <span className="budget-legend-label">{item.label}</span>
                                <span className="budget-legend-value">{item.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="content-card">
                      <h2 className="section-title">{currentMonthName} Summary</h2>
                      <div className="overview-stats-row">
                        <div className="overview-stat-card">
                          <div className="overview-stat-icon" style={{ backgroundColor: '#e1f3e8' }}>
                            <Icon.ArrowDownLeft size={20} color="#1f6f4d" />
                          </div>
                          <div className="overview-stat-label">Income</div>
                          <div className="overview-stat-value" style={{ color: '#1f6f4d' }}>{formatCurrency(monthIncome)}</div>
                        </div>
                        <div className="overview-stat-card">
                          <div className="overview-stat-icon" style={{ backgroundColor: '#fce8e8' }}>
                            <Icon.ArrowUpRight size={20} color="#c73c3c" />
                          </div>
                          <div className="overview-stat-label">Expenses</div>
                          <div className="overview-stat-value" style={{ color: '#c73c3c' }}>{formatCurrency(monthExpenses)}</div>
                        </div>
                      </div>

                      {monthIncome > 0 && (
                        <div className="overview-progress-container">
                          <div className="overview-progress-bar">
                            <div className="overview-progress-fill" style={{ width: `${spendingRatio}%` }} />
                          </div>
                          <div className="overview-progress-text">{spendingRatio}% of income spent</div>
                        </div>
                      )}
                    </div>

                    <div className="content-card">
                      <h2 className="section-title">Quick Insights</h2>
                      <div className="overview-insights-list">
                        {expenseData.length > 0 && (
                          <>
                            <div className="overview-insight-row">
                              <div className="overview-insight-icon" style={{ backgroundColor: expenseData[0].color }}>
                                <FeatherIcon name={expenseData[0].icon} size={16} color="#fff" />
                              </div>
                              <div className="overview-insight-content">
                                <div className="overview-insight-title">{expenseData[0].label}</div>
                                <div className="overview-insight-subtitle">Highest spending • {expenseData[0].count} transactions</div>
                              </div>
                              <span className="overview-insight-amount">{formatCurrency(expenseData[0].amount)}</span>
                            </div>

                            <div className="overview-insight-divider" />
                          </>
                        )}

                        <div className="overview-insight-row">
                          <div className="overview-insight-icon" style={{ backgroundColor: '#1f6f4d' }}>
                            <Icon.Activity size={16} color="#fff" />
                          </div>
                          <div className="overview-insight-content">
                            <div className="overview-insight-title">Total Transactions</div>
                            <div className="overview-insight-subtitle">This month</div>
                          </div>
                          <span className="overview-insight-amount">{monthTransactions.length}</span>
                        </div>

                        <div className="overview-insight-divider" />

                        <div className="overview-insight-row">
                          <div className="overview-insight-icon" style={{ backgroundColor: savingsRate >= 20 ? '#1f6f4d' : '#e67e22' }}>
                            <Icon.Target size={16} color="#fff" />
                          </div>
                          <div className="overview-insight-content">
                            <div className="overview-insight-title">Savings Rate</div>
                            <div className="overview-insight-subtitle">
                              {savingsRate >= 20 ? 'Great job!' : savingsRate >= 10 ? 'Good progress' : 'Room to improve'}
                            </div>
                          </div>
                          <span className="overview-insight-amount" style={{ color: savingsRate >= 20 ? '#1f6f4d' : '#e67e22' }}>
                            {savingsRate}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="content-card">
                      <h2 className="section-title">Net Position</h2>
                      <div className="overview-accounts-list">
                        <div className="overview-account-row">
                          <div className="overview-account-icon">
                            <Icon.TrendingUp size={20} />
                          </div>
                          <div className="overview-account-content">
                            <div className="overview-account-name">{currentMonthName} Net</div>
                            <div className="overview-account-type">Income minus Expenses</div>
                          </div>
                          <span className="overview-account-balance" style={{ color: (monthIncome - monthExpenses) >= 0 ? '#1f6f4d' : '#c73c3c' }}>
                            {(monthIncome - monthExpenses) < 0 ? '-' : '+'}{formatCurrency(Math.abs(monthIncome - monthExpenses))}
                          </span>
                        </div>

                        <div className="overview-insight-divider" />

                        <div className="overview-account-row">
                          <div className="overview-account-icon">
                            <Icon.Calendar size={20} />
                          </div>
                          <div className="overview-account-content">
                            <div className="overview-account-name">Avg Daily Spending</div>
                            <div className="overview-account-type">Based on {now.getDate()} days</div>
                          </div>
                          <span className="overview-account-balance">
                            {formatCurrency(now.getDate() > 0 ? monthExpenses / now.getDate() : 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()
            )}

            {/* Mobile: BUDGET TAB */}
            {activeTab === 'budget' && (
              <div className="content-card budget-placeholder">
                <Icon.PieChart size={48} color="#dcefe4" />
                <h2 className="section-title">Budget Coming Soon</h2>
                <p className="budget-placeholder-hint">Set spending limits for each category</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB Menu */}
      {isFabMenuOpen && (
        <div className="fab-menu-backdrop" onClick={() => setFabMenuOpen(false)}>
          <div className="fab-menu" onClick={(e) => e.stopPropagation()}>
            <button
              className="fab-menu-button"
              onClick={() => {
                setFabMenuOpen(false);
                setManualModalVisible(true);
              }}
            >
              <div className="fab-menu-icon-wrapper">
                <Icon.Edit3 size={20} />
              </div>
              <span className="fab-menu-label">Manual</span>
            </button>
            <label className="fab-menu-button">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  setFabMenuOpen(false);
                  handleFileUpload(e);
                }}
              />
              <div className="fab-menu-icon-wrapper">
                <Icon.Camera size={20} />
              </div>
              <span className="fab-menu-label">Scan Receipt</span>
            </label>
          </div>
        </div>
      )}

      <button
        className={`fab ${isFabMenuOpen ? 'active' : ''}`}
        onClick={() => setFabMenuOpen((prev) => !prev)}
      >
        {isFabMenuOpen ? <Icon.X size={32} /> : <Icon.Plus size={32} />}
      </button>

      {/* Manual Expense Modal */}
      {isManualModalVisible && (
        <div className="modal-overlay" onClick={() => setManualModalVisible(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Expense</h2>
              <button className="modal-close" onClick={() => setManualModalVisible(false)}>
                <Icon.X size={24} />
              </button>
            </div>

            <div className="modal-content">
              <div className="amount-input-card">
                <div className="amount-row">
                  <span className="amount-currency">$</span>
                  <input
                    type="text"
                    className="amount-input-large"
                    value={formatAmountInput(manualAmount)}
                    onChange={(e) => {
                      // Remove commas and everything except digits and decimal point
                      let value = parseAmountInput(e.target.value).replace(/[^0-9.]/g, '');
                      // Ensure only one decimal point
                      const parts = value.split('.');
                      if (parts.length > 2) {
                        value = parts[0] + '.' + parts.slice(1).join('');
                      }
                      // Limit to 2 decimal places
                      if (parts.length === 2 && parts[1].length > 2) {
                        value = parts[0] + '.' + parts[1].slice(0, 2);
                      }
                      setManualAmount(value);
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    onFocus={() => {
                      setCategoryPickerOpen(false);
                      setDatePickerVisible(false);
                    }}
                  />
                </div>
              </div>

              <div className="details-card">
                <div className="details-title">Details</div>

                <div
                  className="detail-row"
                  onClick={() => {
                    setDatePickerVisible(false);
                    setCategoryPickerOpen((p) => !p);
                  }}
                >
                  <span className="detail-label">Category</span>
                  <div className="detail-value-wrap">
                    <span className="detail-value-text">
                      {manualCategoryId
                        ? categories.find((c) => c.id === manualCategoryId)?.label || 'Select Category…'
                        : 'Select Category…'}
                    </span>
                    {isCategoryPickerOpen ? <Icon.ChevronUp size={18} /> : <Icon.ChevronDown size={18} />}
                  </div>
                </div>

                {isCategoryPickerOpen && (
                  <div className="category-picker">
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className={`category-option ${manualCategoryId === cat.id ? 'selected' : ''}`}
                        onClick={() => {
                          setManualCategoryId(cat.id);
                          setCategoryPickerOpen(false);
                        }}
                      >
                        <div className="category-icon-wrap" style={{ backgroundColor: cat.color }}>
                          <FeatherIcon name={cat.icon} size={14} color="#fff" />
                        </div>
                        <span className="category-option-text">{cat.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="detail-row-static">
                  <label className="detail-label">Description</label>
                  <input
                    type="text"
                    className="detail-text-input"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="Description"
                    onFocus={() => {
                      setCategoryPickerOpen(false);
                      setDatePickerVisible(false);
                    }}
                  />
                </div>

                <div
                  className="detail-row"
                  onClick={() => {
                    setCategoryPickerOpen(false);
                    if (!isDatePickerVisible) {
                      setCalendarViewDate(new Date(manualDate));
                    }
                    setDatePickerVisible((p) => !p);
                  }}
                >
                  <span className="detail-label">Date</span>
                  <div className="detail-value-wrap">
                    <Icon.Calendar size={16} />
                    <span className="detail-value-text">{formatShortDate(manualDate)}</span>
                    {isDatePickerVisible ? <Icon.ChevronUp size={18} /> : <Icon.ChevronDown size={18} />}
                  </div>
                </div>

                {isDatePickerVisible && (
                  <div className="date-picker-container">
                    {(() => {
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);

                      const year = calendarViewDate.getFullYear();
                      const month = calendarViewDate.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
                      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

                      const days: (number | null)[] = [];
                      for (let i = 0; i < firstDay; i++) {
                        days.push(null);
                      }
                      for (let i = 1; i <= daysInMonth; i++) {
                        days.push(i);
                      }

                      const weeks: (number | null)[][] = [];
                      for (let i = 0; i < days.length; i += 7) {
                        const week = days.slice(i, i + 7);
                        while (week.length < 7) {
                          week.push(null);
                        }
                        weeks.push(week);
                      }

                      const isSelected = (day: number | null) => {
                        if (!day) return false;
                        return manualDate.getDate() === day &&
                          manualDate.getMonth() === month &&
                          manualDate.getFullYear() === year;
                      };

                      const isToday = (day: number | null) => {
                        if (!day) return false;
                        const t = new Date();
                        return t.getDate() === day && t.getMonth() === month && t.getFullYear() === year;
                      };

                      const isFuture = (day: number | null) => {
                        if (!day) return false;
                        const date = new Date(year, month, day);
                        return date > today;
                      };

                      const canGoNext = () => {
                        const nextMonth = new Date(year, month + 1, 1);
                        return nextMonth <= today;
                      };

                      return (
                        <>
                          <div className="calendar-header">
                            <button
                              className="calendar-arrow"
                              onClick={() => setCalendarViewDate(new Date(year, month - 1, 1))}
                            >
                              <Icon.ChevronLeft size={22} />
                            </button>
                            <span className="calendar-month">{monthNames[month]} {year}</span>
                            <button
                              className="calendar-arrow"
                              onClick={() => canGoNext() && setCalendarViewDate(new Date(year, month + 1, 1))}
                              disabled={!canGoNext()}
                            >
                              <Icon.ChevronRight size={22} />
                            </button>
                          </div>
                          <div className="calendar-day-names">
                            {dayNames.map((name) => (
                              <span key={name} className="calendar-day-name">{name}</span>
                            ))}
                          </div>
                          {weeks.map((week, wi) => (
                            <div key={wi} className="calendar-week">
                              {week.map((day, di) => (
                                <button
                                  key={di}
                                  className={`calendar-day ${isSelected(day) ? 'selected' : ''} ${isToday(day) && !isSelected(day) ? 'today' : ''}`}
                                  onClick={() => {
                                    if (day && !isFuture(day)) {
                                      setManualDate(new Date(year, month, day, 12, 0, 0));
                                      setDatePickerVisible(false);
                                    }
                                  }}
                                  disabled={!day || isFuture(day)}
                                >
                                  <span className={`calendar-day-text ${!day ? 'empty' : ''}`}>
                                    {day || ''}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="detail-row-disabled">
                  <span className="detail-label">Account</span>
                  <span className="detail-disabled-text">Default</span>
                </div>
              </div>

              <button className="primary-button" onClick={addManualExpense}>
                <span className="primary-button-text">Add Expense</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR Modal */}
      {isOcrModalVisible && (
        <div className="modal-overlay" onClick={() => setOcrModalVisible(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Review Extracted Items</h2>
              <button className="modal-close" onClick={() => setOcrModalVisible(false)}>
                <Icon.X size={24} />
              </button>
            </div>

            {isOcrLoading ? (
              <div className="modal-loading">
                <div className="loading-spinner" />
                <span className="modal-loading-text">Scanning receipt…</span>
              </div>
            ) : (
              <div className="modal-content">
                {ocrError && <div className="modal-error">{ocrError}</div>}

                {pendingItems.length === 0 ? (
                  <p className="empty-list-text">No items detected yet.</p>
                ) : (
                  pendingItems.map((item, index) => (
                    <div key={item.id} className="ocr-item-row">
                      <div className="ocr-item-icon" style={{ backgroundColor: '#e3f3e8' }}>
                        <FeatherIcon name={item.categoryIcon || 'ShoppingBag'} size={18} color="#1f6f4d" />
                      </div>
                      <div className="ocr-item-details">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => {
                            const updated = [...pendingItems];
                            updated[index] = { ...updated[index], description: e.target.value };
                            setPendingItems(updated);
                          }}
                          className="ocr-item-description"
                        />
                        <select
                          value={item.category || 'miscellaneous-other'}
                          onChange={(e) => {
                            const updated = [...pendingItems];
                            const catId = e.target.value;
                            const catInfo = categoryMapping[catId] || categoryMapping['miscellaneous-other'];
                            updated[index] = {
                              ...updated[index],
                              category: catId,
                              categoryIcon: catInfo.icon
                            };
                            setPendingItems(updated);
                          }}
                          className="ocr-item-category"
                        >
                          {Object.entries(categoryMapping).map(([id, cat]) => (
                            <option key={id} value={id}>{cat.label}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={String(item.price)}
                        onChange={(e) => {
                          const updated = [...pendingItems];
                          const numericValue = Number(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                          updated[index] = { ...updated[index], price: numericValue };
                          setPendingItems(updated);
                        }}
                        className="ocr-item-price"
                      />
                    </div>
                  ))
                )}

                <button className="primary-button" onClick={addOcrExpenses}>
                  <span className="primary-button-text">Add as Expenses</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalVisible && (
        <div className="modal-overlay" onClick={() => setSettingsModalVisible(false)}>
          <div className="settings-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="modal-close" onClick={() => setSettingsModalVisible(false)}>
                <Icon.X size={24} />
              </button>
            </div>

            <div className="settings-content">
              <div className="settings-section">
                <div className="settings-section-header">
                  <Icon.Cpu size={20} color="#1f6f4d" />
                  <span className="settings-section-title">Gemini AI (Receipt OCR)</span>
                </div>
                <p className="settings-description">
                  Add your Google Gemini API key to enable AI-powered receipt scanning.
                </p>

                <div
                  className="settings-link"
                  onClick={() => alert('Visit aistudio.google.com and create a free API key.\n\n1. Sign in with Google\n2. Click "Get API Key"\n3. Create a new key\n4. Copy and paste it here')}
                >
                  <Icon.ExternalLink size={14} />
                  <span className="settings-link-text">How to get a free API key</span>
                </div>

                <div className="settings-input-group">
                  <label className="settings-input-label">API Key</label>
                  <div className="settings-input-wrap">
                    <input
                      type="password"
                      className="settings-input"
                      value={geminiApiKeyInput}
                      onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                      placeholder="Paste your Gemini API key here"
                    />
                  </div>
                </div>

                {isApiKeySaved && geminiApiKey && (
                  <div className="settings-success-badge">
                    <Icon.CheckCircle size={14} color="#1f6f4d" />
                    <span className="settings-success-text">API key configured</span>
                  </div>
                )}

                <div className="settings-button-row">
                  <button className="settings-button settings-button-primary" onClick={saveGeminiApiKey}>
                    Save Key
                  </button>

                  {isApiKeySaved && (
                    <button
                      className="settings-button settings-button-danger"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to remove your API key?')) {
                          clearGeminiApiKey();
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-header">
                  <Icon.Mail size={20} color="#1f6f4d" />
                  <span className="settings-section-title">Mercado Pago Auto-Import</span>
                </div>
                <p className="settings-description">
                  Forward your Mercado Pago notification emails to automatically track your transactions.
                </p>

                {forwardingEmail && (
                  <>
                    <div className="forwarding-email-box">
                      <code className="forwarding-email-code">{forwardingEmail}</code>
                      <button
                        className="forwarding-email-copy-button"
                        onClick={copyForwardingEmail}
                      >
                        {forwardingEmailCopied ? (
                          <>
                            <Icon.Check size={16} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Icon.Copy size={16} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="forwarding-email-instructions">
                      <div className="forwarding-instruction-step">
                        <span className="forwarding-step-number">1</span>
                        <span>Open your Mercado Pago email notification</span>
                      </div>
                      <div className="forwarding-instruction-step">
                        <span className="forwarding-step-number">2</span>
                        <span>Forward it to the address above</span>
                      </div>
                      <div className="forwarding-instruction-step">
                        <span className="forwarding-step-number">3</span>
                        <span>We'll auto-import and categorize it!</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="settings-section">
                <div className="settings-section-header">
                  <Icon.Info size={20} color="#1f6f4d" />
                  <span className="settings-section-title">About</span>
                </div>
                <p className="settings-description">
                  Your API key is stored locally in your browser and is only used to process receipt images.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Expenses Modal */}
      {isAllExpensesModalVisible && (
        <div className="modal-overlay" onClick={() => setAllExpensesModalVisible(false)}>
          <div className="all-expenses-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">All Expenses</h2>
              <button className="modal-close" onClick={() => setAllExpensesModalVisible(false)}>
                <Icon.X size={24} />
              </button>
            </div>

            <div className="all-expenses-list">
              {transactionsList.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <div className="transaction-divider" />}
                  <div className="transaction-row">
                    <div className="transaction-icon-wrapper">
                      <FeatherIcon name={item.icon} size={18} />
                    </div>
                    <div className="transaction-info">
                      <div className="transaction-label">{item.label}</div>
                      {item.date && (
                        <div className="transaction-date">
                          {formatShortDate(item.date instanceof Date ? item.date : new Date(item.date))}
                        </div>
                      )}
                    </div>
                    <span className={`transaction-amount ${item.amount >= 0 ? 'positive' : 'negative'}`}>
                      {item.amount < 0 ? '-' : ''}{formatCurrency(item.amount)}
                    </span>
                    <button className="delete-button" onClick={() => deleteExpense(item.id)}>
                      <Icon.Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {hasMoreTransactions ? (
                <button className="load-more-button" onClick={loadMoreTransactions} disabled={isLoadingMore}>
                  {isLoadingMore ? (
                    <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  ) : (
                    <>
                      <Icon.ChevronDown size={18} />
                      <span>Load more</span>
                    </>
                  )}
                </button>
              ) : transactionsList.length > 0 ? (
                <p className="no-more-text">No more expenses</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

