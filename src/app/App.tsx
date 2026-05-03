import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Target,
  FileText,
  MessageSquare,
  Users,
  Settings,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Award,
  Calendar,
  Clock,
  Bell,
  Search,
  Zap,
  Upload,
  Sparkles,
  ChevronDown,
  X,
  Type,
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  Crown,
  Check,
  BellRing,
  Flag,
  Briefcase,
  GraduationCap,
  Code,
  Network,
  Play,
  Send,
  SkipForward,
  BarChart3,
  Bot,
  User,
  StopCircle,
  Moon,
  Sun,
  Keyboard,
  Download,
  Printer,
  Flame,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTheme } from 'next-themes';
import { toast, Toaster } from 'sonner';
import {
  analyzeResumeForRole,
  evaluateInterviewAnswer as geminiEvaluateInterviewAnswer,
  generateInterviewQuestions as geminiGenerateInterviewQuestions,
  type ResumeAnalysisResult,
} from '@/lib/gemini';
import { redirectToStripeCheckout, stripePromise } from '@/lib/stripeCheckout';
import { extractResumeText, MAX_RESUME_BYTES } from '@/lib/extractResumeText';
import { loadActivityStreak, recordActivity } from '@/lib/activityStreak';
import {
  buildResumeAnalysisMarkdown,
  downloadTextFile,
  openPrintableAnalysis,
} from '@/lib/exportResumeAnalysis';
import {
  loadColorPalette,
  saveColorPalette,
  type ColorPaletteId,
} from '@/lib/colorPalettePreference';

const PROFILE_STORAGE_KEY = 'careerAssistant_profile_v1';

type UserProfilePersisted = {
  displayName: string;
  applicationsCount: number;
};

/** Maps legacy demo default saved in older browsers so UI matches shipped defaults. */
function migrateStoredDisplayName(rawName: string): string {
  const t = rawName.trim();
  if (!t) return 'Viraj Parmar';
  if (/^vinay\s+kumar$/i.test(t)) return 'Viraj Parmar';
  return t;
}

function loadPersistedProfile(): UserProfilePersisted {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { displayName: 'Viraj Parmar', applicationsCount: 0 };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const parsed =
      typeof p.displayName === 'string' && p.displayName.trim() ? p.displayName.trim() : 'Viraj Parmar';
    const displayName = migrateStoredDisplayName(parsed);
    const applicationsCount =
      typeof p.applicationsCount === 'number' && p.applicationsCount >= 0 ? Math.floor(p.applicationsCount) : 0;
    const profile = { displayName, applicationsCount };
    // Rewrite storage once when migrating so refreshes stay consistent without relying on effects only.
    if (parsed !== displayName) {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      } catch {
        /* ignore */
      }
    }
    return profile;
  } catch {
    return { displayName: 'Viraj Parmar', applicationsCount: 0 };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobRole, setJobRole] = useState('Software Engineer');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventType, setNewEventType] = useState<'interview' | 'review' | 'event'>('interview');
  const [newEventDate, setNewEventDate] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Resume analysis complete', message: 'Your resume scored 8.6/10', time: '5m ago', read: false },
    { id: 2, title: 'Interview reminder', message: 'Mock Interview scheduled for today at 10:00 AM', time: '1h ago', read: false },
    { id: 3, title: 'New job match', message: '3 new jobs match your profile', time: '2h ago', read: true }
  ]);
  const [careerGoals, setCareerGoals] = useState<Array<{
    id: number;
    title: string;
    description: string;
    category: 'skill' | 'job' | 'certification' | 'project' | 'network';
    deadline: string;
    progress: number;
    completed: boolean;
    createdAt: string;
  }>>([
    { id: 1, title: 'Learn Cloud Architecture', description: 'Master AWS/Azure fundamentals and get certified', category: 'skill', deadline: '2026-08-01', progress: 45, completed: false, createdAt: '2026-04-15' },
    { id: 2, title: 'Land Senior Developer Role', description: 'Get promoted to senior position at a top tech company', category: 'job', deadline: '2026-12-31', progress: 30, completed: false, createdAt: '2026-04-10' },
    { id: 3, title: 'Build Portfolio Website', description: 'Create a professional portfolio showcasing 5+ projects', category: 'project', deadline: '2026-06-15', progress: 75, completed: false, createdAt: '2026-04-20' }
  ]);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState<'skill' | 'job' | 'certification' | 'project' | 'network'>('skill');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [goalFilter, setGoalFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Interview Prep State
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewRole, setInterviewRole] = useState('Software Engineer');
  const [interviewType, setInterviewType] = useState<'behavioral' | 'technical' | 'mixed'>('mixed');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [interviewAnswers, setInterviewAnswers] = useState<Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
  }>>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [interviewSessions, setInterviewSessions] = useState<Array<{
    id: number;
    role: string;
    type: string;
    date: string;
    score: number;
    questionsCount: number;
  }>>([
    { id: 1, role: 'Software Engineer', type: 'mixed', date: '2026-04-28', score: 85, questionsCount: 5 },
    { id: 2, role: 'Frontend Developer', type: 'technical', date: '2026-04-25', score: 78, questionsCount: 5 }
  ]);
  const [resumeAnalysisResult, setResumeAnalysisResult] = useState<ResumeAnalysisResult | null>(null);
  const [interviewQuestionsLoading, setInterviewQuestionsLoading] = useState(false);
  const [interviewQuestionBank, setInterviewQuestionBank] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfilePersisted>(() => loadPersistedProfile());
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [activityStreak, setActivityStreak] = useState(() => loadActivityStreak());
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [answerSeconds, setAnswerSeconds] = useState(0);
  const [colorPalette, setColorPalette] = useState<ColorPaletteId>(() => loadColorPalette());

  const bumpActivityStreak = () => setActivityStreak(recordActivity());

  const jobRoles = [
    'Software Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'DevOps Engineer',
    'Data Scientist',
    'Product Manager',
    'UX/UI Designer',
    'Mobile Developer',
    'Cloud Architect'
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      toast.error('File must be 10MB or smaller.');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      toast.error('File must be 10MB or smaller.');
      return;
    }
    setSelectedFile(file);
  };

  const handleAnalyze = async () => {
    let resumeText = pastedText.trim();

    if (!resumeText && selectedFile) {
      try {
        resumeText = (await extractResumeText(selectedFile)).trim();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not read file';
        toast.error(msg);
        return;
      }
    }

    if (!resumeText) {
      toast.error('Add resume text or upload a file to analyze');
      return;
    }

    setIsAnalyzing(true);
    toast.loading('Gemini is analyzing your resume...', { id: 'analyze' });
    try {
      const result = await analyzeResumeForRole(resumeText, jobRole);
      setResumeAnalysisResult(result);
      setShowAnalysis(true);
      const scoreStr = `${result.score.toFixed(1)}/10`;
      toast.success(`Analysis complete! Score: ${scoreStr} for ${jobRole}`, {
        id: 'analyze',
        duration: 4000,
      });
      const newNotification = {
        id: Date.now(),
        title: 'Resume Analysis Complete',
        message: `Your resume scored ${scoreStr} for ${jobRole}`,
        time: 'Just now',
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
      setUserProfile((p) => ({ ...p, applicationsCount: p.applicationsCount + 1 }));
      bumpActivityStreak();
      if (result.score >= 8) {
        void confetti({ particleCount: 140, spread: 72, origin: { y: 0.72 }, colors: ['#a855f7', '#ec4899', '#22c55e'] });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      toast.error(msg, { id: 'analyze' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim()) {
      setSelectedFile(null);
      setShowPasteDialog(false);
      toast.success('Resume text added successfully!');
    } else {
      toast.error('Please paste your resume text');
    }
  };

  const formatTime = (time24: string) => {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleScheduleInterview = () => {
    if (newEventTitle.trim() && newEventTime.trim() && newEventDate) {
      const newEvent = {
        title: newEventTitle,
        time: formatTime(newEventTime),
        type: newEventType,
        date: newEventDate
      };
      setUpcomingEvents([...upcomingEvents, newEvent]);

      // Add notification
      const newNotification = {
        id: Date.now(),
        title: 'Event Scheduled',
        message: `${newEventTitle} scheduled for ${new Date(newEventDate).toLocaleDateString()}`,
        time: 'Just now',
        read: false
      };
      setNotifications([newNotification, ...notifications]);

      setShowScheduleDialog(false);
      setNewEventTitle('');
      setNewEventTime('');
      setNewEventDate('');
      setNewEventType('interview');
      toast.success('Interview scheduled successfully!');
    } else {
      toast.error('Please fill in all fields');
    }
  };

  const handleDeleteEvent = (index: number) => {
    const updatedEvents = upcomingEvents.filter((_, i) => i !== index);
    setUpcomingEvents(updatedEvents);
    setShowEventDialog(false);
    setSelectedEvent(null);
    toast.success('Event deleted successfully');
  };

  const getEventsForDate = (date: string) => {
    return upcomingEvents.filter(event => event.date === date);
  };

  const hasEventOnDate = (day: number) => {
    const dateStr = `2026-05-${day.toString().padStart(2, '0')}`;
    return upcomingEvents.some(event => event.date === dateStr);
  };

  const markNotificationAsRead = (id: number) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAllNotifications = () => {
    const snapshot = [...notifications];
    setNotifications([]);
    toast.success('All notifications cleared', {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => setNotifications(snapshot),
      },
    });
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const greetingFirstName = userProfile.displayName.trim().split(/\s+/)[0] || 'there';
  const profileAvatarLetter = (userProfile.displayName.trim()[0] ?? '?').toUpperCase();

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
    } catch {
      /* quota / private mode */
    }
  }, [userProfile]);

  useEffect(() => {
    saveColorPalette(colorPalette);
  }, [colorPalette]);

  useEffect(() => {
    void stripePromise;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get('upgrade');
    if (upgrade === 'success') {
      toast.success('Payment successful. Welcome to Pro!');
      params.delete('upgrade');
      params.delete('session_id');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    } else if (upgrade === 'cancel') {
      toast.info('Checkout was canceled.');
      params.delete('upgrade');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, []);

  const handleAddGoal = () => {
    if (newGoalTitle.trim() && newGoalDeadline) {
      if (editingGoal !== null) {
        // Update existing goal
        setCareerGoals(careerGoals.map(goal =>
          goal.id === editingGoal
            ? { ...goal, title: newGoalTitle, description: newGoalDescription, category: newGoalCategory, deadline: newGoalDeadline }
            : goal
        ));
        toast.success('Goal updated successfully!');
      } else {
        // Add new goal
        const newGoal = {
          id: Date.now(),
          title: newGoalTitle,
          description: newGoalDescription,
          category: newGoalCategory,
          deadline: newGoalDeadline,
          progress: 0,
          completed: false,
          createdAt: new Date().toISOString()
        };
        setCareerGoals([...careerGoals, newGoal]);
        toast.success('Goal created successfully!');

        // Add notification
        const newNotification = {
          id: Date.now(),
          title: 'New Goal Created',
          message: `${newGoalTitle} - Due ${new Date(newGoalDeadline).toLocaleDateString()}`,
          time: 'Just now',
          read: false
        };
        setNotifications([newNotification, ...notifications]);
      }

      setShowGoalDialog(false);
      setNewGoalTitle('');
      setNewGoalDescription('');
      setNewGoalCategory('skill');
      setNewGoalDeadline('');
      setEditingGoal(null);
    } else {
      toast.error('Please fill in title and deadline');
    }
  };

  const handleDeleteGoal = (id: number) => {
    setCareerGoals(careerGoals.filter(goal => goal.id !== id));
    toast.success('Goal deleted');
  };

  const handleToggleComplete = (id: number) => {
    setCareerGoals(careerGoals.map(goal =>
      goal.id === id
        ? { ...goal, completed: !goal.completed, progress: goal.completed ? goal.progress : 100 }
        : goal
    ));
  };

  const handleUpdateProgress = (id: number, progress: number) => {
    setCareerGoals(careerGoals.map(goal =>
      goal.id === id ? { ...goal, progress } : goal
    ));
  };

  const handleEditGoal = (goal: typeof careerGoals[0]) => {
    setEditingGoal(goal.id);
    setNewGoalTitle(goal.title);
    setNewGoalDescription(goal.description);
    setNewGoalCategory(goal.category);
    setNewGoalDeadline(goal.deadline);
    setShowGoalDialog(true);
  };

  const filteredGoals = careerGoals.filter(goal => {
    if (goalFilter === 'active') return !goal.completed;
    if (goalFilter === 'completed') return goal.completed;
    return true;
  });

  const goalsCompleted = careerGoals.filter(g => g.completed).length;
  const averageProgress = careerGoals.length > 0
    ? Math.round(careerGoals.reduce((sum, g) => sum + g.progress, 0) / careerGoals.length)
    : 0;

  // Interview Questions Database
  const interviewQuestions = {
    'Software Engineer': {
      behavioral: [
        'Tell me about a time when you had to debug a critical production issue.',
        'Describe a situation where you had to work with a difficult team member.',
        'How do you prioritize tasks when working on multiple projects?',
        'Tell me about a project you\'re most proud of and why.',
        'Describe a time when you had to learn a new technology quickly.'
      ],
      technical: [
        'Explain the difference between a process and a thread.',
        'What is the time complexity of common sorting algorithms?',
        'How would you design a URL shortening service like bit.ly?',
        'Explain REST API principles and best practices.',
        'What is the difference between SQL and NoSQL databases?'
      ]
    },
    'Frontend Developer': {
      behavioral: [
        'Tell me about a challenging UI/UX problem you solved.',
        'How do you ensure your websites are accessible?',
        'Describe your process for optimizing website performance.',
        'Tell me about a time you had to meet a tight deadline.',
        'How do you stay updated with the latest frontend technologies?'
      ],
      technical: [
        'Explain the virtual DOM and how React uses it.',
        'What are CSS Grid and Flexbox, and when would you use each?',
        'How do you handle state management in large applications?',
        'Explain the concept of responsive design.',
        'What are the differences between var, let, and const in JavaScript?'
      ]
    },
    'Data Scientist': {
      behavioral: [
        'Describe a data science project where you had significant impact.',
        'How do you communicate complex findings to non-technical stakeholders?',
        'Tell me about a time when your model didn\'t perform as expected.',
        'How do you approach feature engineering?',
        'Describe your experience with A/B testing.'
      ],
      technical: [
        'Explain the bias-variance tradeoff.',
        'What is the difference between supervised and unsupervised learning?',
        'How would you handle missing data in a dataset?',
        'Explain precision, recall, and F1 score.',
        'What is regularization and why is it important?'
      ]
    }
  };

  const getInterviewQuestions = (role: string, type: 'behavioral' | 'technical' | 'mixed') => {
    const roleQuestions = interviewQuestions[role as keyof typeof interviewQuestions] || interviewQuestions['Software Engineer'];

    if (type === 'mixed') {
      const behavioral = roleQuestions.behavioral.slice(0, 3);
      const technical = roleQuestions.technical.slice(0, 2);
      return [...behavioral, ...technical].sort(() => Math.random() - 0.5);
    }

    return roleQuestions[type].slice(0, 5);
  };

  const evaluateAnswerHeuristic = (question: string, answer: string, type: string): { feedback: string; score: number } => {
    const answerLength = answer.trim().split(' ').length;

    if (answerLength < 10) {
      return {
        feedback: 'Your answer is too brief. Try to provide more details and examples to better demonstrate your knowledge and experience.',
        score: 40
      };
    }

    if (answerLength < 30) {
      return {
        feedback: 'Good start! Your answer covers the basics. Consider adding more specific examples or details to strengthen your response.',
        score: 65
      };
    }

    if (answerLength < 60) {
      return {
        feedback: 'Well-structured answer! You provided good details. To make it even better, consider using the STAR method (Situation, Task, Action, Result) for behavioral questions.',
        score: 80
      };
    }

    return {
      feedback: 'Excellent response! Your answer is detailed, well-structured, and demonstrates clear understanding. Great use of examples and specific details.',
      score: 95
    };
  };

  const handleStartInterview = async () => {
    setInterviewActive(true);
    setCurrentQuestionIndex(0);
    setInterviewAnswers([]);
    setUserAnswer('');
    setInterviewQuestionsLoading(true);
    setInterviewQuestionBank([]);
    toast.loading('Gemini is preparing your questions...', { id: 'interview-q' });
    try {
      const qs = await geminiGenerateInterviewQuestions(interviewRole, interviewType);
      setInterviewQuestionBank(qs);
      toast.success(`Starting ${interviewType} interview for ${interviewRole}`, { id: 'interview-q' });
    } catch {
      const fallback = getInterviewQuestions(interviewRole, interviewType);
      setInterviewQuestionBank(fallback);
      toast.success(`Starting ${interviewType} interview for ${interviewRole} (built-in questions)`, {
        id: 'interview-q',
      });
    } finally {
      setInterviewQuestionsLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) {
      toast.error('Please provide an answer');
      return;
    }

    const questions =
      interviewQuestionBank.length > 0
        ? interviewQuestionBank
        : getInterviewQuestions(interviewRole, interviewType);
    if (questions.length === 0) {
      toast.error('Questions are still loading');
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    const answerText = userAnswer;

    setIsThinking(true);
    try {
      let evaluation = evaluateAnswerHeuristic(currentQuestion, answerText, interviewType);
      try {
        evaluation = await geminiEvaluateInterviewAnswer(currentQuestion, answerText, interviewType);
      } catch {
        // keep heuristic feedback if Gemini fails
      }

      const newAnswer = {
        question: currentQuestion,
        answer: answerText,
        feedback: evaluation.feedback,
        score: evaluation.score,
      };

      const nextAnswers = [...interviewAnswers, newAnswer];
      setInterviewAnswers(nextAnswers);
      setUserAnswer('');

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        toast.success('Answer submitted! Next question loaded.');
      } else {
        const averageScore = Math.round(
          nextAnswers.reduce((sum, a) => sum + a.score, 0) / nextAnswers.length
        );

        const newSession = {
          id: Date.now(),
          role: interviewRole,
          type: interviewType,
          date: new Date().toISOString().split('T')[0],
          score: averageScore,
          questionsCount: questions.length,
        };

        setInterviewSessions((prev) => [newSession, ...prev]);
        bumpActivityStreak();
        toast.success(`Interview complete! Your score: ${averageScore}%`);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const handleEndInterview = () => {
    if (interviewAnswers.length > 0) {
      const averageScore = Math.round(
        interviewAnswers.reduce((sum, a) => sum + a.score, 0) / interviewAnswers.length
      );

      const newSession = {
        id: Date.now(),
        role: interviewRole,
        type: interviewType,
        date: new Date().toISOString().split('T')[0],
        score: averageScore,
        questionsCount: interviewAnswers.length
      };

      setInterviewSessions([newSession, ...interviewSessions]);
      bumpActivityStreak();
    }

    setInterviewActive(false);
    setCurrentQuestionIndex(0);
    setInterviewAnswers([]);
    setUserAnswer('');
    setInterviewQuestionBank([]);
    setInterviewQuestionsLoading(false);
    toast.info('Interview session ended');
  };

  const resolvedInterviewQuestions = interviewActive
    ? interviewQuestionsLoading
      ? []
      : interviewQuestionBank.length > 0
        ? interviewQuestionBank
        : getInterviewQuestions(interviewRole, interviewType)
    : getInterviewQuestions(interviewRole, interviewType);
  const interviewProgress =
    interviewActive && resolvedInterviewQuestions.length > 0
      ? ((currentQuestionIndex + 1) / resolvedInterviewQuestions.length) * 100
      : 0;

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interviewActive || interviewQuestionsLoading || isThinking) return;
    const id = window.setInterval(() => setAnswerSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [interviewActive, interviewQuestionsLoading, isThinking]);

  useEffect(() => {
    setAnswerSeconds(0);
  }, [currentQuestionIndex, interviewActive]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShortcutsModal) setShowShortcutsModal(false);
        if (showPasteDialog) setShowPasteDialog(false);
        if (showScheduleDialog) setShowScheduleDialog(false);
        if (showUpgradeDialog) setShowUpgradeDialog(false);
        if (showNotifications) setShowNotifications(false);
        if (showGoalDialog) {
          setShowGoalDialog(false);
          setEditingGoal(null);
          setNewGoalTitle('');
          setNewGoalDescription('');
          setNewGoalCategory('skill');
          setNewGoalDeadline('');
        }
        if (showEventDialog) {
          setShowEventDialog(false);
          setSelectedEvent(null);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [
    showShortcutsModal,
    showPasteDialog,
    showScheduleDialog,
    showEventDialog,
    showUpgradeDialog,
    showNotifications,
    showGoalDialog,
  ]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showNotifications && !target.closest('.notification-container')) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'goals', label: 'Career Goals', icon: Target },
    { id: 'resume', label: 'Resume Builder', icon: FileText },
    { id: 'interview', label: 'Interview Prep', icon: MessageSquare },
    { id: 'networking', label: 'Networking', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const getJobSpecificInsights = (role: string) => {
    const insights: Record<string, { strengths: string[], improvements: string[], tips: string[] }> = {
      'Software Engineer': {
        strengths: [
          'Strong technical knowledge in modern frameworks',
          'Excellent problem-solving abilities',
          'Good understanding of system design principles',
          'Well-documented code samples in portfolio'
        ],
        improvements: [
          'Add more details about scalability in projects',
          'Include metrics on performance improvements',
          'Expand cloud architecture experience',
          'Add more system design case studies'
        ],
        tips: [
          'Review top 50 LeetCode problems for coding interviews',
          'Practice explaining complex systems simply',
          'Prepare examples of debugging production issues',
          'Study common design patterns and when to use them'
        ]
      },
      'Frontend Developer': {
        strengths: [
          'Strong proficiency in React and modern CSS',
          'Great attention to UI/UX details',
          'Good understanding of responsive design',
          'Experience with component libraries'
        ],
        improvements: [
          'Add performance optimization examples',
          'Include accessibility improvements made',
          'Showcase cross-browser testing experience',
          'Add examples of state management at scale'
        ],
        tips: [
          'Prepare to discuss CSS architecture decisions',
          'Review browser rendering and performance',
          'Practice live coding UI components',
          'Study accessibility best practices (WCAG)'
        ]
      },
      'Data Scientist': {
        strengths: [
          'Strong statistical analysis background',
          'Proficiency in Python and ML libraries',
          'Good data visualization skills',
          'Experience with real-world datasets'
        ],
        improvements: [
          'Include business impact of ML models',
          'Add more details on model deployment',
          'Showcase A/B testing experience',
          'Highlight data pipeline optimization'
        ],
        tips: [
          'Review probability and statistics fundamentals',
          'Prepare to explain ML models to non-technical audience',
          'Practice case studies on business problems',
          'Study ethical considerations in ML'
        ]
      }
    };

    return insights[role] || insights['Software Engineer'];
  };

  const fallbackInsights = getJobSpecificInsights(jobRole);
  const strengths =
    resumeAnalysisResult?.strengths?.length ? resumeAnalysisResult.strengths : fallbackInsights.strengths;
  const improvements =
    resumeAnalysisResult?.improvements?.length
      ? resumeAnalysisResult.improvements
      : fallbackInsights.improvements;
  const tips =
    resumeAnalysisResult?.tips?.length ? resumeAnalysisResult.tips : fallbackInsights.tips;
  const resumeScoreDisplay = resumeAnalysisResult?.score ?? 8.6;
  const resumeScorePercent = Math.round(Math.min(100, Math.max(0, resumeScoreDisplay * 10)));
  const resumeSummary =
    resumeAnalysisResult?.summary ||
    `You're doing great! Your resume shows strong technical skills and relevant experience for a ${jobRole} role. Focus on highlighting more specific achievements and quantifiable results in your projects.`;
  const matchLabel = resumeAnalysisResult?.matchLabel ?? 'Excellent Match';
  const percentileLabel = resumeAnalysisResult?.percentileLabel ?? 'Top 15%';

  const [upcomingEvents, setUpcomingEvents] = useState<Array<{
    time: string;
    title: string;
    type: 'interview' | 'review' | 'event';
    date: string;
  }>>([
    { time: '10:00 AM', title: 'Mock Interview', type: 'interview', date: '2026-05-02' },
    { time: '2:30 PM', title: 'Resume Review', type: 'review', date: '2026-05-05' },
    { time: '4:00 PM', title: 'Networking Event', type: 'event', date: '2026-05-12' }
  ]);

  const interviewsStat =
    upcomingEvents.filter((e) => e.type === 'interview').length + interviewSessions.length;

  const isLight = mounted && resolvedTheme === 'light';
  const formatAnswerElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-palette={colorPalette}
      className={`app-root min-h-screen transition-colors duration-300 ${
        isLight ? 'ui-page-light text-slate-900' : 'ui-page-dark text-white'
      }`}
    >
      <Toaster position="top-right" theme={isLight ? 'light' : 'dark'} richColors />

      {/* Keyboard shortcuts */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsModal(false);
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-6 h-6 ui-text-icon" />
                <h3 className="text-lg font-semibold">Keyboard shortcuts</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="p-2 rounded-lg hover:bg-slate-700/80"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex justify-between gap-4">
                <span>Open this panel</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-900 ui-border-strong font-mono text-xs">?</kbd>
              </li>
              <li className="flex justify-between gap-4">
                <span>Close dialogs / menus</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-900 ui-border-strong font-mono text-xs">Esc</kbd>
              </li>
            </ul>
            <p className="text-xs text-gray-500 mt-4">Shortcuts are disabled while typing in fields.</p>
          </div>
        </div>
      )}

      {/* Paste Resume Text Dialog */}
      {showPasteDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPasteDialog(false);
            }
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between p-6 ui-border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 ui-bg-soft rounded-lg flex items-center justify-center">
                  <Type className="w-5 h-5 ui-text-icon" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Paste Your Resume</h3>
                  <p className="text-sm text-gray-400">Copy and paste your resume text below</p>
                </div>
              </div>
              <button
                onClick={() => setShowPasteDialog(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste your resume text here..."
                className="w-full h-80 bg-slate-900/50 ui-border-strong rounded-xl p-4 text-sm resize-none focus:outline-none ui-focus transition-colors"
              />
              <p className="text-xs text-gray-400 mt-2">
                {pastedText.trim().length} characters
              </p>
            </div>

            <div className="flex gap-3 p-6 ui-border-t">
              <button
                onClick={() => {
                  setShowPasteDialog(false);
                  setPastedText('');
                }}
                className="flex-1 bg-slate-700/50 hover:bg-slate-700 ui-border rounded-lg py-3 font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={!pastedText.trim()}
                className="flex-1 ui-btn-gradient rounded-lg py-3 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use This Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Dialog */}
      {showScheduleDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowScheduleDialog(false);
            }
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-lg w-full animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between p-6 ui-border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 ui-bg-soft rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 ui-text-icon" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Schedule Interview</h3>
                  <p className="text-sm text-gray-400">Add a new event to your calendar</p>
                </div>
              </div>
              <button
                onClick={() => setShowScheduleDialog(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Event Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['interview', 'review', 'event'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewEventType(type)}
                      className={`px-4 py-2 rounded-lg border transition-all capitalize ${
                        newEventType === type
                          ? 'ui-toggle-on'
                          : 'ui-toggle-off'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Event Title</label>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="e.g., Google Interview Round 1"
                  className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm focus:outline-none ui-focus transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Date</label>
                  <input
                    type="date"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm focus:outline-none ui-focus transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Time</label>
                  <input
                    type="time"
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm focus:outline-none ui-focus transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 ui-border-t">
              <button
                onClick={() => {
                  setShowScheduleDialog(false);
                  setNewEventTitle('');
                  setNewEventTime('');
                  setNewEventDate('');
                  setNewEventType('interview');
                }}
                className="flex-1 bg-slate-700/50 hover:bg-slate-700 ui-border rounded-lg py-3 font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleInterview}
                disabled={!newEventTitle.trim() || !newEventTime.trim() || !newEventDate}
                className="flex-1 ui-btn-gradient rounded-lg py-3 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Dialog */}
      {showEventDialog && selectedEvent !== null && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEventDialog(false);
              setSelectedEvent(null);
            }
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-md w-full animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between p-6 ui-border-b">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  upcomingEvents[selectedEvent].type === 'interview' ? 'bg-green-500/20' :
                  upcomingEvents[selectedEvent].type === 'review' ? 'bg-blue-500/20' :
                  'ui-bg-soft'
                }`}>
                  {upcomingEvents[selectedEvent].type === 'interview' ? <MessageSquare className="w-5 h-5 text-green-400" /> :
                   upcomingEvents[selectedEvent].type === 'review' ? <FileText className="w-5 h-5 text-blue-400" /> :
                   <Users className="w-5 h-5 ui-text-icon" />}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{upcomingEvents[selectedEvent].title}</h3>
                  <p className="text-sm text-gray-400 capitalize">{upcomingEvents[selectedEvent].type}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEventDialog(false);
                  setSelectedEvent(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                <Calendar className="w-5 h-5 ui-text-icon" />
                <div>
                  <p className="text-xs text-gray-400">Date</p>
                  <p className="text-sm font-medium">{new Date(upcomingEvents[selectedEvent].date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                <Clock className="w-5 h-5 ui-text-icon" />
                <div>
                  <p className="text-xs text-gray-400">Time</p>
                  <p className="text-sm font-medium">{upcomingEvents[selectedEvent].time}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 ui-border-t">
              <button
                onClick={() => handleDeleteEvent(selectedEvent)}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg py-3 font-medium transition-all flex items-center justify-center gap-2 text-red-400"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={() => {
                  setShowEventDialog(false);
                  setSelectedEvent(null);
                }}
                className="flex-1 ui-btn-solid rounded-lg py-3 font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade to Pro Dialog */}
      {showUpgradeDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUpgradeDialog(false);
            }
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 ui-glow-overlay" />
              <div className="relative p-6 ui-border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 ui-profile-grad rounded-xl flex items-center justify-center">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">Upgrade to Pro</h3>
                      <p className="text-sm ui-text-soft">Unlock all premium features</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowUpgradeDialog(false)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-3">
                {[
                  'Unlimited resume analyses',
                  'Advanced interview preparation with AI',
                  'Personalized job recommendations',
                  'Priority support',
                  'Resume templates library',
                  'Detailed analytics and insights',
                  'Cover letter generator',
                  'Interview recording and feedback'
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-lg">
                    <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="ui-tint rounded-xl p-4 mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Monthly</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold">$29</span>
                    <span className="text-sm text-gray-400">/month</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Annual</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-400">$249</span>
                    <span className="text-sm text-gray-400">/year</span>
                    <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Save 30%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 ui-border-t shrink-0">
              <button
                onClick={() => setShowUpgradeDialog(false)}
                className="flex-1 bg-slate-700/50 hover:bg-slate-700 ui-border rounded-lg py-3 font-medium transition-all"
              >
                Maybe Later
              </button>
              <button
                onClick={async () => {
                  toast.loading('Opening secure checkout...', { id: 'stripe-checkout' });
                  try {
                    await redirectToStripeCheckout('monthly');
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Could not start checkout';
                    toast.error(msg, { id: 'stripe-checkout', duration: 6000 });
                  }
                }}
                className="flex-1 ui-btn-gradient rounded-lg py-3 font-medium transition-all flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4" />
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Goal Dialog */}
      {showGoalDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowGoalDialog(false);
              setEditingGoal(null);
            }
          }}
        >
          <div className="bg-slate-800 ui-border-strong rounded-2xl shadow-2xl max-w-lg w-full animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between p-6 ui-border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 ui-bg-soft rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 ui-text-icon" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{editingGoal ? 'Edit Goal' : 'Add New Goal'}</h3>
                  <p className="text-sm text-gray-400">Set your career objective</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowGoalDialog(false);
                  setEditingGoal(null);
                  setNewGoalTitle('');
                  setNewGoalDescription('');
                  setNewGoalCategory('skill');
                  setNewGoalDeadline('');
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Goal Category</label>
                <div className="grid grid-cols-5 gap-2">
                  {([
                    { value: 'skill', icon: Code, label: 'Skill' },
                    { value: 'job', icon: Briefcase, label: 'Job' },
                    { value: 'certification', icon: GraduationCap, label: 'Cert' },
                    { value: 'project', icon: Flag, label: 'Project' },
                    { value: 'network', icon: Network, label: 'Network' }
                  ] as const).map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setNewGoalCategory(cat.value)}
                        className={`px-3 py-2 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                          newGoalCategory === cat.value
                            ? 'ui-toggle-on'
                            : 'ui-toggle-off'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Goal Title *</label>
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g., Learn React Native"
                  className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm focus:outline-none ui-focus transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={newGoalDescription}
                  onChange={(e) => setNewGoalDescription(e.target.value)}
                  placeholder="Add more details about your goal..."
                  rows={3}
                  className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm resize-none focus:outline-none ui-focus transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Deadline *</label>
                <input
                  type="date"
                  value={newGoalDeadline}
                  onChange={(e) => setNewGoalDeadline(e.target.value)}
                  className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm focus:outline-none ui-focus transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 ui-border-t">
              <button
                onClick={() => {
                  setShowGoalDialog(false);
                  setEditingGoal(null);
                  setNewGoalTitle('');
                  setNewGoalDescription('');
                  setNewGoalCategory('skill');
                  setNewGoalDeadline('');
                }}
                className="flex-1 bg-slate-700/50 hover:bg-slate-700 ui-border rounded-lg py-3 font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGoal}
                disabled={!newGoalTitle.trim() || !newGoalDeadline}
                className="flex-1 ui-btn-gradient rounded-lg py-3 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {editingGoal ? 'Update Goal' : 'Add Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 z-40 h-screen w-64 border-r flex flex-col ui-shell-aside-l"
      >
        <div className="p-6 ui-border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 ui-logo-grad rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-semibold">AI Career Assistant</h1>
              <p className="text-xs ui-text-soft">Your success partner</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== 'dashboard') {
                    toast.info(`Navigating to ${item.label}`, { duration: 2000 });
                  }
                }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-all group ${
                  activeTab === item.id
                    ? 'ui-nav-active'
                    : 'ui-nav-item'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </div>
                {activeTab === item.id && (
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 ui-border-t">
          <div className="ui-btn-gradient rounded-lg p-4 relative overflow-hidden group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4" />
                <p className="text-sm font-medium">Upgrade to Pro</p>
              </div>
              <p className="text-xs ui-text-faint mb-3">Get unlimited access to all features</p>
              <button
                onClick={() => setShowUpgradeDialog(true)}
                className="w-full bg-white text-purple-600 rounded-lg py-2 text-sm font-medium hover:bg-purple-50 transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 flex items-center gap-2 ui-border-t">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold">
            {profileAvatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{greetingFirstName}</p>
            <p className="text-xs text-gray-400 truncate">{jobRole}</p>
          </div>
          <button
            type="button"
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
            className="w-9 h-9 rounded-lg hover:ui-bg-soft transition-colors flex items-center justify-center shrink-0"
            title={isLight ? 'Dark mode' : 'Light mode'}
            aria-label="Toggle theme"
          >
            {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-300" />}
          </button>
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="w-9 h-9 rounded-lg hover:ui-bg-soft transition-colors flex items-center justify-center shrink-0"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
          <div className="relative notification-container">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-9 h-9 rounded-lg hover:ui-bg-soft transition-colors flex items-center justify-center relative"
            >
              <Bell className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute bottom-full left-0 mb-2 w-80 bg-slate-800 ui-border-strong rounded-xl shadow-2xl overflow-hidden z-50 animate-[fadeIn_0.2s_ease-out]">
                <div className="p-4 ui-border-b flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Notifications</h4>
                    <p className="text-xs text-gray-400">{unreadCount} unread</p>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      className="text-xs ui-text-icon hover:ui-text-soft transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => markNotificationAsRead(notif.id)}
                        className={`p-4 ui-row-divide hover:bg-purple-500/10 transition-colors cursor-pointer ${
                          !notif.read ? 'bg-purple-500/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notif.read ? 'bg-blue-500' : 'bg-gray-600'}`} />
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-1">{notif.title}</p>
                            <p className="text-xs text-gray-400 mb-2">{notif.message}</p>
                            <p className="text-xs text-gray-500">{notif.time}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400">
                      <BellRing className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No notifications</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 mr-80 p-8">
        <div className="max-w-5xl">
          {/* Different content based on active tab */}
          {activeTab === 'goals' && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-4xl font-bold mb-2">Career Goals</h2>
                  <p className="ui-text-dim">Set and track your career objectives</p>
                </div>
                <button
                  onClick={() => setShowGoalDialog(true)}
                  className="ui-btn-gradient rounded-lg px-6 py-3 font-medium transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add New Goal
                </button>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="ui-tint rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Target className="w-8 h-8 ui-text-icon" />
                  </div>
                  <p className="text-3xl font-bold mb-1">{careerGoals.length}</p>
                  <p className="text-sm text-gray-300">Total Goals</p>
                </div>

                <div className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-3xl font-bold mb-1">{goalsCompleted}</p>
                  <p className="text-sm text-gray-300">Completed</p>
                </div>

                <div className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="text-3xl font-bold mb-1">{averageProgress}%</p>
                  <p className="text-sm text-gray-300">Avg Progress</p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 mb-6">
                {(['all', 'active', 'completed'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setGoalFilter(filter)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all capitalize ${
                      goalFilter === filter
                        ? 'ui-accent-fill text-white'
                        : 'bg-slate-800/50 text-gray-300 hover:bg-slate-800'
                    }`}
                  >
                    {filter} ({filter === 'all' ? careerGoals.length : filter === 'active' ? careerGoals.filter(g => !g.completed).length : goalsCompleted})
                  </button>
                ))}
              </div>

              {/* Goals List */}
              <div className="space-y-4">
                {filteredGoals.length > 0 ? (
                  filteredGoals.map((goal) => {
                    const daysUntilDeadline = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    const isOverdue = daysUntilDeadline < 0 && !goal.completed;
                    const categoryIcons = {
                      skill: Code,
                      job: Briefcase,
                      certification: GraduationCap,
                      project: Flag,
                      network: Network
                    };
                    const CategoryIcon = categoryIcons[goal.category];

                    return (
                      <div
                        key={goal.id}
                        className={`bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border transition-all ${
                          goal.completed
                            ? 'border-green-500/30 bg-green-500/5'
                            : isOverdue
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'ui-border ui-card-hover-border'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            goal.completed ? 'bg-green-500/20' : 'ui-bg-soft'
                          }`}>
                            <CategoryIcon className={`w-6 h-6 ${goal.completed ? 'text-green-400' : 'ui-text-icon'}`} />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className={`text-lg font-semibold mb-1 ${goal.completed ? 'line-through text-gray-400' : ''}`}>
                                  {goal.title}
                                </h3>
                                {goal.description && (
                                  <p className="text-sm text-gray-400 mb-3">{goal.description}</p>
                                )}
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                  <span className="capitalize px-2 py-1 ui-bg-soft ui-text-soft rounded">
                                    {goal.category}
                                  </span>
                                  <span className={isOverdue ? 'text-red-400' : 'text-gray-400'}>
                                    {goal.completed ? 'Completed' : isOverdue ? `Overdue by ${Math.abs(daysUntilDeadline)} days` : `${daysUntilDeadline} days left`}
                                  </span>
                                  <span>Due: {new Date(goal.deadline).toLocaleDateString()}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditGoal(goal)}
                                  className="w-8 h-8 rounded-lg hover:ui-bg-soft transition-colors flex items-center justify-center"
                                  title="Edit goal"
                                >
                                  <Edit className="w-4 h-4 text-gray-400 hover:text-white" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGoal(goal.id)}
                                  className="w-8 h-8 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center"
                                  title="Delete goal"
                                >
                                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                </button>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-400">Progress</span>
                                <span className="text-sm font-medium">{goal.progress}%</span>
                              </div>
                              <div className="relative">
                                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      goal.completed
                                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                                        : 'bg-gradient-to-r ui-progress'
                                    }`}
                                    style={{ width: `${goal.progress}%` }}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={goal.progress}
                                  onChange={(e) => handleUpdateProgress(goal.id, parseInt(e.target.value))}
                                  disabled={goal.completed}
                                  className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                  title="Drag to update progress"
                                />
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleToggleComplete(goal.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                                  goal.completed
                                    ? 'bg-slate-700/50 text-gray-300 hover:bg-slate-700'
                                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                }`}
                              >
                                <Check className="w-4 h-4" />
                                {goal.completed ? 'Mark Incomplete' : 'Mark Complete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 ui-border text-center">
                    <Target className="w-16 h-16 mx-auto mb-4 ui-text-icon opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">No Goals Yet</h3>
                    <p className="text-gray-400 mb-6">
                      {goalFilter === 'all'
                        ? 'Start setting career goals to track your progress'
                        : goalFilter === 'active'
                        ? 'No active goals. Create one to get started!'
                        : 'No completed goals yet. Keep working on your active goals!'}
                    </p>
                    <button
                      onClick={() => goalFilter === 'all' ? setShowGoalDialog(true) : setGoalFilter('all')}
                      className="ui-btn-solid px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      {goalFilter === 'all' ? 'Add Your First Goal' : 'View All Goals'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'resume' && (
            <div className="mb-8">
              <h2 className="text-4xl font-bold mb-2">Resume Builder</h2>
              <p className="ui-text-dim mb-8">Create and customize your professional resume</p>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 ui-border">
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto mb-4 ui-text-icon opacity-50" />
                  <h3 className="text-xl font-semibold mb-2">Resume Builder Coming Soon</h3>
                  <p className="text-gray-400 mb-6">Build professional resumes with our AI-powered builder.</p>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="ui-btn-solid px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'interview' && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-4xl font-bold mb-2">Interview Preparation</h2>
                  <p className="ui-text-dim">Practice with AI-powered mock interviews</p>
                </div>
                {!interviewActive && (
                  <button
                    onClick={handleStartInterview}
                    className="ui-btn-gradient rounded-lg px-6 py-3 font-medium transition-all flex items-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    Start Mock Interview
                  </button>
                )}
              </div>

              {!interviewActive ? (
                <>
                  {/* Setup Section */}
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 ui-border">
                      <h3 className="font-semibold mb-4">Select Interview Type</h3>
                      <div className="space-y-3">
                        {(['behavioral', 'technical', 'mixed'] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => setInterviewType(type)}
                            className={`w-full p-4 rounded-lg border transition-all text-left ${
                              interviewType === type
                                ? 'ui-toggle-on'
                                : 'ui-toggle-off'
                            }`}
                          >
                            <p className="font-medium capitalize mb-1">{type} Questions</p>
                            <p className="text-xs text-gray-400">
                              {type === 'behavioral' ? 'Focus on past experiences and situations' :
                               type === 'technical' ? 'Test your technical knowledge and skills' :
                               'Mix of behavioral and technical questions'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 ui-border">
                      <h3 className="font-semibold mb-4">Select Job Role</h3>
                      <div className="space-y-2">
                        {['Software Engineer', 'Frontend Developer', 'Data Scientist'].map((role) => (
                          <button
                            key={role}
                            onClick={() => setInterviewRole(role)}
                            className={`w-full p-3 rounded-lg border transition-all text-left ${
                              interviewRole === role
                                ? 'ui-toggle-on'
                                : 'ui-toggle-off'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>

                      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <div className="flex items-start gap-3">
                          <Bot className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-blue-300 mb-1">AI Interview Coach</p>
                            <p className="text-xs text-gray-400">
                              You'll receive 5 questions tailored to your role. Answer each question and get instant AI feedback.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Past Sessions */}
                  <div>
                    <h3 className="text-2xl font-semibold mb-4">Past Interview Sessions</h3>
                    {interviewSessions.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {interviewSessions.map((session) => (
                          <div
                            key={session.id}
                            className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 ui-border ui-card-hover-border transition-colors"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h4 className="font-semibold mb-1">{session.role}</h4>
                                <p className="text-sm text-gray-400 capitalize">{session.type} Interview</p>
                              </div>
                              <div className={`text-2xl font-bold ${
                                session.score >= 80 ? 'text-green-400' :
                                session.score >= 60 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {session.score}%
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm text-gray-400">
                              <span>{session.questionsCount} questions</span>
                              <span>{new Date(session.date).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 ui-border text-center">
                        <BarChart3 className="w-12 h-12 mx-auto mb-3 ui-text-icon opacity-50" />
                        <p className="text-gray-400">No interview sessions yet. Start your first mock interview!</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Active Interview */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 ui-bg-soft rounded-full flex items-center justify-center">
                          <Bot className="w-6 h-6 ui-text-icon" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">AI Interview Coach</p>
                          <p className="font-semibold">{interviewRole} - {interviewType}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleEndInterview}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                      >
                        <StopCircle className="w-4 h-4" />
                        End Interview
                      </button>
                    </div>

                    {/* Progress */}
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Question {currentQuestionIndex + 1} of {Math.max(resolvedInterviewQuestions.length, 1)}</span>
                        <span className="text-sm font-medium">{Math.round(interviewProgress)}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r ui-progress transition-all"
                          style={{ width: `${interviewProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Current Question */}
                  <div className="ui-tint rounded-2xl p-8 mb-6">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-12 h-12 ui-accent-fill rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm ui-text-soft mb-2">AI Interviewer</p>
                        <h3 className="text-xl font-semibold leading-relaxed">
                          {interviewQuestionsLoading
                            ? 'Generating personalized questions with Gemini...'
                            : resolvedInterviewQuestions[currentQuestionIndex] ?? 'Loading question...'}
                        </h3>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <User className="w-5 h-5 text-blue-400" />
                        <p className="text-sm font-medium">Your Answer</p>
                      </div>
                      <textarea
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type your answer here... (Tip: Use the STAR method for behavioral questions - Situation, Task, Action, Result)"
                        disabled={isThinking || interviewQuestionsLoading}
                        className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-sm resize-none focus:outline-none ui-focus transition-colors min-h-[150px] disabled:opacity-50"
                      />
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>{userAnswer.trim().split(' ').filter(w => w).length} words</span>
                          <span className="flex items-center gap-1.5 ui-text-soft">
                            <Clock className="w-3.5 h-3.5" />
                            {formatAnswerElapsed(answerSeconds)}
                          </span>
                        </p>
                        <button
                          onClick={handleSubmitAnswer}
                          disabled={
                            !userAnswer.trim() ||
                            isThinking ||
                            interviewQuestionsLoading ||
                            resolvedInterviewQuestions.length === 0
                          }
                          className="flex items-center gap-2 px-6 py-3 ui-btn-gradient rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isThinking ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              AI Analyzing...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              Submit Answer
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Previous Answers */}
                  {interviewAnswers.length > 0 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-4">Previous Answers & Feedback</h3>
                      <div className="space-y-4">
                        {interviewAnswers.map((item, idx) => (
                          <div key={idx} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 ui-border">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <p className="text-sm text-gray-400 mb-2">Question {idx + 1}</p>
                                <p className="font-medium mb-3">{item.question}</p>
                                <p className="text-sm text-gray-300 mb-4">
                                  <span className="text-blue-400 font-medium">Your answer: </span>
                                  {item.answer}
                                </p>
                              </div>
                              <div className={`text-2xl font-bold ml-4 ${
                                item.score >= 80 ? 'text-green-400' :
                                item.score >= 60 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {item.score}%
                              </div>
                            </div>
                            <div className={`p-4 rounded-lg ${
                              item.score >= 80 ? 'bg-green-500/10 border border-green-500/20' :
                              item.score >= 60 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                              'bg-red-500/10 border border-red-500/20'
                            }`}>
                              <p className="text-sm">
                                <span className="font-medium">AI Feedback: </span>
                                {item.feedback}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'networking' && (
            <div className="mb-8">
              <h2 className="text-4xl font-bold mb-2">Networking</h2>
              <p className="ui-text-dim mb-8">Build and manage your professional network</p>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 ui-border">
                <div className="text-center py-12">
                  <Users className="w-16 h-16 mx-auto mb-4 ui-text-icon opacity-50" />
                  <h3 className="text-xl font-semibold mb-2">Networking Tools Coming Soon</h3>
                  <p className="text-gray-400 mb-6">Connect with professionals and expand your network.</p>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="ui-btn-solid px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="mb-8">
              <h2 className="text-4xl font-bold mb-2">Settings</h2>
              <p className="ui-text-dim mb-8">Manage your profile and preferences</p>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 ui-border max-w-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-14 h-14 ui-profile-grad rounded-full flex items-center justify-center text-xl font-bold shrink-0">
                    {profileAvatarLetter}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Profile</h3>
                    <p className="text-sm text-gray-400">Shown on your dashboard and sidebar</p>
                  </div>
                </div>

                <label className="block text-sm font-medium ui-text-dim mb-2">Display name</label>
                <input
                  type="text"
                  value={userProfile.displayName}
                  onChange={(e) => setUserProfile((p) => ({ ...p, displayName: e.target.value }))}
                  className="w-full bg-slate-900/50 ui-border-strong rounded-xl px-4 py-3 text-sm mb-6 focus:outline-none ui-focus transition-colors"
                  placeholder="Your name"
                  autoComplete="name"
                />

                <div className="rounded-xl bg-slate-900/40 ui-border p-4 mb-6">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Target role</p>
                  <p className="text-white font-medium">{jobRole}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Change this from the job role dropdown on the Dashboard or Resume Builder tab — it drives AI resume analysis.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-900/40 ui-border p-4 mb-6">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Accent palette</p>
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        { id: 'aurora' as const, label: 'Aurora', hint: 'Purple & pink' },
                        { id: 'navy-teal' as const, label: 'Navy & teal', hint: 'Calm, premium' },
                        { id: 'charcoal-violet' as const, label: 'Charcoal & violet', hint: 'Bold, cinematic' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setColorPalette(opt.id);
                          toast.success(`Color palette: ${opt.label}`);
                        }}
                        className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm transition-colors ${
                          colorPalette === opt.id
                            ? 'ui-border-strong ui-bg-soft ring-1 ring-inset ring-white/10'
                            : 'ui-border hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="font-medium text-white">{opt.label}</span>
                        <span className="text-xs text-gray-500">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 items-center justify-between pt-2 ui-border-t-faint">
                  <div className="text-sm text-gray-400">
                    Applications logged:{' '}
                    <span className="text-white font-semibold">{userProfile.applicationsCount}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="ui-btn-solid px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
          <>
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-4xl font-bold mb-2">Hi, {greetingFirstName}! 👋</h2>
            <p className="ui-text-dim">Ready to take your career to the next level? Let's see what we can do for your goal job.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 border border-orange-500/20 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Flame className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Activity streak</p>
                <p className="text-2xl font-bold">
                  {activityStreak.streak} <span className="text-base font-normal text-gray-400">day{activityStreak.streak === 1 ? '' : 's'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {activityStreak.activeDaysThisWeek.length} active day
                  {activityStreak.activeDaysThisWeek.length === 1 ? '' : 's'} this week
                </p>
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 ui-border flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl ui-bg-soft flex items-center justify-center">
                <Zap className="w-6 h-6 ui-text-icon" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Keep the momentum</p>
                <p className="text-sm text-gray-300">
                  Analyze a resume, log an application, or finish a mock interview to build your streak.
                </p>
              </div>
            </div>
          </div>

          {/* Resume Upload Section */}
          {!showAnalysis && !isAnalyzing && (
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6 mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Get AI-Powered Resume Analysis</h3>
                <p className="text-sm text-gray-300">Upload your resume and select your target job role to receive personalized feedback and recommendations</p>
              </div>
            </div>
          )}

          {/* Analyzing Progress */}
          {isAnalyzing && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 mb-8 ui-border">
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-20 h-20 ui-bg-soft rounded-full flex items-center justify-center mb-6 relative">
                  <Sparkles className="w-10 h-10 ui-text-icon animate-pulse" />
                  <div className="absolute inset-0 ui-spinner" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Analyzing Your Resume</h3>
                <p className="ui-text-dim text-center mb-6">
                  Our AI is reviewing your resume for the {jobRole} position...
                </p>
                <div className="w-full max-w-md bg-slate-700/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r ui-progress transition-all duration-[2000ms] ease-out"
                    style={{ width: '85%' }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {!isAnalyzing && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 mb-8 ui-border">
            <div className="grid grid-cols-2 gap-6">
              {/* Upload Area */}
              <div>
                <label className="block text-sm font-medium mb-3">Upload or Paste your resume</label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="ui-dropzone rounded-xl p-8 text-center ui-border-hover transition-colors cursor-pointer bg-slate-900/30"
                >
                  <input
                    type="file"
                    id="resume-upload"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 ui-bg-soft rounded-full flex items-center justify-center">
                        {pastedText && !selectedFile ? (
                          <Type className="w-8 h-8 ui-text-icon" />
                        ) : (
                          <Upload className="w-8 h-8 ui-text-icon" />
                        )}
                      </div>
                      {selectedFile ? (
                        <>
                          <div className="flex items-center gap-2 justify-center">
                            <FileText className="w-4 h-4 text-green-400" />
                            <p className="text-sm text-green-400 font-medium">{selectedFile.name}</p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {(selectedFile.size / 1024).toFixed(2)} KB • Uploaded successfully
                          </p>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedFile(null);
                            }}
                            className="text-xs ui-text-icon hover:ui-text-soft transition-colors"
                          >
                            Remove file
                          </button>
                        </>
                      ) : pastedText ? (
                        <>
                          <div className="flex items-center gap-2 justify-center">
                            <Type className="w-4 h-4 text-green-400" />
                            <p className="text-sm text-green-400 font-medium">Resume Text Added</p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {pastedText.trim().length} characters • Ready to analyze
                          </p>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setPastedText('');
                            }}
                            className="text-xs ui-text-icon hover:ui-text-soft transition-colors"
                          >
                            Remove text
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-gray-300">Drag & drop your file here, or click to upload</p>
                          <p className="text-xs text-gray-500">
                            PDF, Word (DOCX), and text-based files — or any file we can read as text. Max 10MB
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
                <div className="mt-4 text-center">
                  <span className="text-sm text-gray-400">— OR —</span>
                </div>
                <button
                  onClick={() => setShowPasteDialog(true)}
                  className="w-full mt-4 bg-slate-700/50 hover:bg-slate-700 ui-border rounded-lg py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Type className="w-4 h-4" />
                  Paste Resume Text
                </button>
              </div>

              {/* Job Role & Analyze */}
              <div className="flex flex-col justify-between">
                <div>
                  <label className="block text-sm font-medium mb-3">Select Job Role</label>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full bg-slate-900/50 ui-border-strong rounded-lg px-4 py-3 text-left flex items-center justify-between ui-border-hover transition-colors"
                    >
                      <span>{jobRole}</span>
                      <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {dropdownOpen && (
                      <div className="absolute top-full mt-2 w-full bg-slate-800 ui-border-strong rounded-lg shadow-2xl max-h-64 overflow-y-auto z-10">
                        {jobRoles.map((role) => (
                          <button
                            key={role}
                            onClick={() => {
                              setJobRole(role);
                              setDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:ui-bg-soft transition-colors ${
                              jobRole === role ? 'ui-chip-active ui-text-dim' : ''
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    onClick={handleAnalyze}
                    disabled={(!selectedFile && !pastedText.trim()) || isAnalyzing}
                    className="w-full ui-btn-gradient rounded-lg py-4 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Analyze My Resume
                      </>
                    )}
                  </button>
                  <p className="text-xs text-center text-gray-400 mt-3">
                    AI will analyze and generate insights
                  </p>
                  <div className="mt-4 text-left">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyDetails((o) => !o)}
                      className="text-xs ui-text-icon hover:ui-text-soft transition-colors"
                    >
                      {showPrivacyDetails ? 'Hide' : 'What we send to the AI'}
                    </button>
                    {showPrivacyDetails && (
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                        Your resume text is sent to Google&apos;s Gemini API (trimmed to the first 14,000 characters)
                        along with your selected job role. The model returns a score and tips only — we don&apos;t
                        store your resume on a server in this demo; it stays in your browser session unless you
                        export it.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Stats Card */}
          {showAnalysis && (
            <div className="ui-btn-gradient rounded-2xl p-6 mb-8 shadow-2xl ui-shadow-accent">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="ui-text-faint text-sm mb-1">Your Progress</p>
                  <h3 className="text-2xl font-bold">Career Readiness Score</h3>
                </div>
                <Award className="w-12 h-12 ui-text-dim" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <p className="text-sm ui-text-dim mb-1">Resume Score</p>
                  <p className="text-2xl font-bold">{resumeScorePercent}%</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <p className="text-sm ui-text-dim mb-1">Interview Prep</p>
                  <p className="text-2xl font-bold">78%</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <p className="text-sm ui-text-dim mb-1">Network Size</p>
                  <p className="text-2xl font-bold">145</p>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {showAnalysis && (
            <div className="mb-8 animate-[fadeIn_0.5s_ease-in]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-2xl font-semibold">Your Analysis Results</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm ui-text-soft ui-bg-soft px-3 py-1 rounded-full">
                  Analyzed for: {jobRole}
                </span>
                {resumeAnalysisResult && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const md = buildResumeAnalysisMarkdown(jobRole, resumeAnalysisResult);
                        const safe = jobRole.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
                        downloadTextFile(`resume-analysis-${safe}.md`, md, 'text/markdown;charset=utf-8');
                        toast.success('Markdown downloaded');
                      }}
                      className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 ui-border-strong transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Export .md
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openPrintableAnalysis(jobRole, resumeAnalysisResult);
                        toast.info('Use your browser print dialog → Save as PDF');
                      }}
                      className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 ui-border-strong transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      Print / PDF
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setShowAnalysis(false);
                    setSelectedFile(null);
                    setPastedText('');
                    setResumeAnalysisResult(null);
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Upload New Resume
                </button>
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 ui-border">
              <div className="flex items-center gap-8 mb-6">
                <div className="relative">
                  <svg className="w-40 h-40" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      fill="none"
                      stroke="rgba(139, 92, 246, 0.2)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      strokeDasharray={`${(resumeScoreDisplay / 10) * 439.6} 439.6`}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                    <text
                      x="80"
                      y="85"
                      textAnchor="middle"
                      className="fill-white"
                      style={{ fontSize: '36px', fontWeight: 'bold' }}
                    >
                      {resumeScoreDisplay.toFixed(1)}
                    </text>
                    <text
                      x="80"
                      y="105"
                      textAnchor="middle"
                      className="ui-fill-svg"
                      style={{ fontSize: '14px' }}
                    >
                      / 10
                    </text>
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-semibold mb-2">Overall Score for {jobRole}</h4>
                  <p className="ui-text-dim mb-4">{resumeSummary}</p>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm">{matchLabel}</span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">{percentileLabel}</span>
                  </div>
                </div>
              </div>

              {/* Grid of insights */}
              <div className="grid grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl p-4 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <h5 className="font-semibold">Strengths</h5>
                  </div>
                  <ul className="space-y-2">
                    {strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <ChevronRight className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-xl p-4 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <h5 className="font-semibold">Areas to Improve</h5>
                  </div>
                  <ul className="space-y-2">
                    {improvements.map((improvement, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <ChevronRight className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Recommended Tips */}
          {showAnalysis && (
            <div>
            <h3 className="text-2xl font-semibold mb-4">Recommended Tips</h3>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 ui-border">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-6 h-6 text-yellow-400" />
                <h5 className="font-semibold text-lg">Interview Preparation Tips</h5>
              </div>
              <ul className="space-y-3">
                {tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-pointer">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>
                    <span className="text-gray-200">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          )}
          </>
          )}
        </div>
      </main>

      {/* Right Sidebar */}
      <aside
        className="fixed right-0 top-0 h-screen w-80 border-l p-6 overflow-y-auto ui-shell-aside-r"
      >
        {/* Profile Section */}
        <div className="mb-6">
          <div className="ui-profile-grad rounded-2xl p-6 text-center relative">
            {unreadCount > 0 && (
              <div
                className="absolute top-4 right-4 min-w-[1.5rem] h-6 px-1 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white"
                title={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold">
              {profileAvatarLetter}
            </div>
            <h3 className="font-semibold text-lg mb-1">{userProfile.displayName.trim() || 'Your name'}</h3>
            <p className="text-sm ui-text-dim mb-4">{jobRole}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  const prev = userProfile.applicationsCount;
                  setUserProfile((p) => ({ ...p, applicationsCount: p.applicationsCount + 1 }));
                  bumpActivityStreak();
                  toast.success('Logged a job application (+1)', {
                    duration: 8000,
                    action: {
                      label: 'Undo',
                      onClick: () => setUserProfile((p) => ({ ...p, applicationsCount: prev })),
                    },
                  });
                }}
                className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 flex-1 hover:bg-white/15 transition-colors text-left"
                title="Includes analyses you run plus taps here to log submissions"
              >
                <p className="text-xs ui-text-dim">Applications</p>
                <p className="text-lg font-bold">{userProfile.applicationsCount}</p>
              </button>
              <div
                className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 flex-1 text-left"
                title="Calendar interviews scheduled plus mock interview sessions completed"
              >
                <p className="text-xs ui-text-dim">Interviews</p>
                <p className="text-lg font-bold">{interviewsStat}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Schedule</h4>
            <Calendar className="w-5 h-5 ui-text-icon" />
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 ui-border mb-4">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-center text-xs text-gray-400 p-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, i) => {
                const day = i - 2; // Start from previous month
                const isCurrentMonth = day >= 1 && day <= 31;
                const dateStr = `2026-05-${day.toString().padStart(2, '0')}`;
                const isSelected = selectedDate === dateStr;
                const hasEvent = isCurrentMonth && hasEventOnDate(day);
                const isToday = dateStr === '2026-05-02'; // Current date

                return (
                  <button
                    key={i}
                    onClick={() => isCurrentMonth && setSelectedDate(dateStr)}
                    disabled={!isCurrentMonth}
                    className={`aspect-square rounded-lg text-xs flex items-center justify-center relative transition-all ${
                      isSelected
                        ? 'ui-accent-fill text-white'
                        : isToday
                        ? 'bg-blue-500/20 text-blue-300 font-semibold'
                        : isCurrentMonth
                        ? 'hover:ui-bg-soft text-white'
                        : 'text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {isCurrentMonth ? day : ''}
                    {hasEvent && (
                      <span className="absolute bottom-0.5 w-1 h-1 bg-pink-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setShowScheduleDialog(true)}
            className="w-full ui-btn-gradient rounded-lg py-3 font-medium hover:shadow-lg hover:ui-shadow-accent transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Schedule My Interview
          </button>
        </div>

        {/* Upcoming Events */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">
              {selectedDate ? `Events on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Upcoming Events'}
            </h4>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-xs ui-text-icon hover:ui-text-soft transition-colors"
              >
                Show All
              </button>
            )}
          </div>
          <div className="space-y-3">
            {(selectedDate ? getEventsForDate(selectedDate) : upcomingEvents)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((event, i) => {
                const originalIndex = upcomingEvents.findIndex(e => e === event);
                return (
                  <div
                    key={originalIndex}
                    onClick={() => {
                      setSelectedEvent(originalIndex);
                      setShowEventDialog(true);
                    }}
                    className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 ui-border ui-card-hover-border transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        event.type === 'interview' ? 'bg-green-500/20 group-hover:bg-green-500/30' :
                        event.type === 'review' ? 'bg-blue-500/20 group-hover:bg-blue-500/30' :
                        'ui-bg-soft group-hover:bg-purple-500/30'
                      }`}>
                        {event.type === 'interview' ? <MessageSquare className="w-5 h-5 text-green-400" /> :
                         event.type === 'review' ? <FileText className="w-5 h-5 text-blue-400" /> :
                         <Users className="w-5 h-5 ui-text-icon" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-xs text-gray-400">{event.time} • {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            {(selectedDate ? getEventsForDate(selectedDate) : upcomingEvents).length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No events scheduled</p>
                <button
                  onClick={() => setShowScheduleDialog(true)}
                  className="text-xs ui-text-icon hover:ui-text-soft mt-2 transition-colors"
                >
                  Schedule one now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6">
          <h4 className="font-semibold mb-4">Quick Actions</h4>
          <div className="space-y-2">
            <button
              onClick={() => {
                toast.success('Opening job search...', { icon: '🔍' });
                setTimeout(() => {
                  toast.info('Feature coming soon! Stay tuned.', { duration: 3000 });
                }, 500);
              }}
              className="w-full bg-slate-800/50 hover:bg-slate-800 ui-border rounded-lg py-3 px-4 text-sm font-medium text-left flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 ui-text-icon" />
                <span>Find Jobs</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={() => setActiveTab('goals')}
              className="w-full bg-slate-800/50 hover:bg-slate-800 ui-border rounded-lg py-3 px-4 text-sm font-medium text-left flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span>Track Progress</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
