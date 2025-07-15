import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, CheckCircle, Users, Heart, Brain, Shield } from "lucide-react";
import { ContactFormModal } from "@/components/contact-form-modal";

interface QuizQuestion {
  id: string;
  question: string;
  description?: string;
  options: {
    value: string;
    label: string;
    points: {
      base: number;
      plus: number;
      elite: number;
    };
  }[];
}

const quizQuestions: QuizQuestion[] = [
  {
    id: "coverage_type",
    question: "Who needs healthcare coverage?",
    description: "This helps us understand your family situation",
    options: [
      {
        value: "individual",
        label: "Just me",
        points: { base: 3, plus: 3, elite: 3 }
      },
      {
        value: "couple",
        label: "Me and my spouse/partner",
        points: { base: 2, plus: 3, elite: 3 }
      },
      {
        value: "family_small",
        label: "Me and 1-2 children",
        points: { base: 2, plus: 3, elite: 3 }
      },
      {
        value: "family_large",
        label: "Large family (3+ children)",
        points: { base: 1, plus: 2, elite: 3 }
      }
    ]
  },
  {
    id: "health_conditions",
    question: "Do you or your family members have ongoing health conditions?",
    description: "Chronic conditions require more frequent care",
    options: [
      {
        value: "none",
        label: "No ongoing health conditions",
        points: { base: 3, plus: 2, elite: 1 }
      },
      {
        value: "minor",
        label: "Minor conditions (allergies, occasional issues)",
        points: { base: 2, plus: 3, elite: 2 }
      },
      {
        value: "moderate",
        label: "1-2 chronic conditions (diabetes, hypertension)",
        points: { base: 1, plus: 3, elite: 3 }
      },
      {
        value: "complex",
        label: "Multiple or complex health conditions",
        points: { base: 0, plus: 2, elite: 3 }
      }
    ]
  },
  {
    id: "healthcare_usage",
    question: "How often do you typically need medical care?",
    description: "Consider doctor visits, urgent care, and health concerns",
    options: [
      {
        value: "rarely",
        label: "Rarely - just annual checkups",
        points: { base: 3, plus: 2, elite: 1 }
      },
      {
        value: "occasional",
        label: "Occasionally - a few times per year",
        points: { base: 2, plus: 3, elite: 2 }
      },
      {
        value: "frequent",
        label: "Frequently - monthly or more",
        points: { base: 1, plus: 2, elite: 3 }
      },
      {
        value: "very_frequent",
        label: "Very frequently - multiple times per month",
        points: { base: 0, plus: 1, elite: 3 }
      }
    ]
  },
  {
    id: "specialist_needs",
    question: "Do you need specialist care or referrals?",
    description: "Some plans offer better specialist access",
    options: [
      {
        value: "no",
        label: "No, primary care is sufficient",
        points: { base: 3, plus: 2, elite: 1 }
      },
      {
        value: "occasional",
        label: "Occasionally for specific issues",
        points: { base: 2, plus: 3, elite: 2 }
      },
      {
        value: "regular",
        label: "Regular specialist visits needed",
        points: { base: 1, plus: 2, elite: 3 }
      },
      {
        value: "complex",
        label: "Multiple specialists and coordinated care",
        points: { base: 0, plus: 1, elite: 3 }
      }
    ]
  },
  {
    id: "mental_health",
    question: "Is mental health support important to you?",
    description: "Consider counseling, therapy, and mental wellness services",
    options: [
      {
        value: "not_important",
        label: "Not a priority right now",
        points: { base: 3, plus: 2, elite: 1 }
      },
      {
        value: "somewhat",
        label: "Somewhat important for wellness",
        points: { base: 2, plus: 3, elite: 2 }
      },
      {
        value: "important",
        label: "Important - occasional support needed",
        points: { base: 1, plus: 3, elite: 3 }
      },
      {
        value: "critical",
        label: "Critical - ongoing mental health care",
        points: { base: 0, plus: 2, elite: 3 }
      }
    ]
  },
  {
    id: "convenience",
    question: "How important is convenience and premium service?",
    description: "Consider concierge service, priority scheduling, and premium features",
    options: [
      {
        value: "basic",
        label: "Basic service is fine",
        points: { base: 3, plus: 2, elite: 1 }
      },
      {
        value: "convenient",
        label: "Some convenience features preferred",
        points: { base: 2, plus: 3, elite: 2 }
      },
      {
        value: "premium",
        label: "Premium service and priority access",
        points: { base: 1, plus: 2, elite: 3 }
      },
      {
        value: "concierge",
        label: "Full concierge experience",
        points: { base: 0, plus: 1, elite: 3 }
      }
    ]
  }
];

const planInfo = {
  base: {
    name: "MyPremierPlan Base",
    price: "$59-149",
    icon: Shield,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    features: [
      "Unlimited virtual telehealth visits 24/7",
      "Primary care physician visits", 
      "Preventive care and wellness exams",
      "Chronic disease management",
      "Generic medications (when applicable)"
    ]
  },
  plus: {
    name: "MyPremierPlan+",
    price: "$99-279", 
    icon: Heart,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    features: [
      "Everything in Base plan",
      "Specialist referrals and coordination",
      "Mental health support and counseling",
      "Enhanced preventive care programs",
      "Priority scheduling and support"
    ]
  },
  elite: {
    name: "MyPremierPlan Elite",
    price: "$119-349",
    icon: Brain,
    color: "text-purple-600", 
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    features: [
      "Everything in Plus plan",
      "Premium provider network access",
      "Executive health services",
      "Concierge medical support",
      "Advanced diagnostic services",
      "24/7 dedicated health concierge"
    ]
  }
};

export default function Quiz() {
  const [, setLocation] = useLocation();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const progress = ((currentQuestion + 1) / quizQuestions.length) * 100;

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (currentQuestion < quizQuestions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const calculateRecommendation = () => {
    const scores = { base: 0, plus: 0, elite: 0 };
    
    Object.entries(answers).forEach(([questionId, answerValue]) => {
      const question = quizQuestions.find(q => q.id === questionId);
      const option = question?.options.find(o => o.value === answerValue);
      
      if (option) {
        scores.base += option.points.base;
        scores.plus += option.points.plus;
        scores.elite += option.points.elite;
      }
    });

    // Determine recommended tier
    const maxScore = Math.max(scores.base, scores.plus, scores.elite);
    
    if (scores.elite === maxScore) return 'elite';
    if (scores.plus === maxScore) return 'plus';
    return 'base';
  };

  const handleStartEnrollment = (tier: string) => {
    // For agent-assisted enrollment, show contact form instead of direct registration
    setSelectedPlan(tier);
    setShowContactForm(true);
  };

  const retakeQuiz = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setShowResults(false);
  };

  if (showResults) {
    const recommendedTier = calculateRecommendation();
    const recommendedPlan = planInfo[recommendedTier as keyof typeof planInfo];
    const Icon = recommendedPlan.icon;

    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Recommendation</h1>
            <p className="text-gray-600">Based on your answers, here's the best plan for you</p>
          </div>

          {/* Recommended Plan */}
          <Card className={`mb-8 ${recommendedPlan.borderColor} border-2`}>
            <CardHeader className={`${recommendedPlan.bgColor} text-center`}>
              <div className="flex justify-center mb-4">
                <div className={`p-4 rounded-full ${recommendedPlan.bgColor} ${recommendedPlan.borderColor} border-2`}>
                  <Icon className={`h-12 w-12 ${recommendedPlan.color}`} />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">
                Recommended: {recommendedPlan.name}
              </CardTitle>
              <p className={`text-xl font-semibold ${recommendedPlan.color}`}>
                {recommendedPlan.price}/month
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3 mb-6">
                {recommendedPlan.features.map((feature, index) => (
                  <div key={index} className="flex items-center">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => handleStartEnrollment(recommendedTier)}
                  className="flex-1 bg-white hover:bg-gray-100 text-black border border-gray-300 py-3"
                >
                  Start Enrollment with {recommendedPlan.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setLocation('/registration')}
                  className="flex-1"
                >
                  View All Plans
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* All Plans Comparison */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
              Compare All Plans
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(planInfo).map(([tier, plan]) => {
                const Icon = plan.icon;
                const isRecommended = tier === recommendedTier;
                
                return (
                  <Card 
                    key={tier}
                    className={`relative ${isRecommended ? `${plan.borderColor} border-2` : 'border-gray-200'}`}
                  >
                    {isRecommended && (
                      <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 ${plan.bgColor} ${plan.borderColor} border px-3 py-1 rounded-full`}>
                        <span className={`text-sm font-semibold ${plan.color}`}>Recommended</span>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-4">
                      <Icon className={`h-8 w-8 ${plan.color} mx-auto mb-2`} />
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <p className={`text-lg font-semibold ${plan.color}`}>{plan.price}</p>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      <Button 
                        variant={isRecommended ? "default" : "outline"}
                        className={`w-full mb-4 ${isRecommended ? 'bg-white hover:bg-gray-100 text-black border border-gray-300' : ''}`}
                        onClick={() => handleStartEnrollment(tier)}
                      >
                        Select Plan
                      </Button>
                      
                      <div className="space-y-2">
                        {plan.features.slice(0, 3).map((feature, index) => (
                          <div key={index} className="flex items-center text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                            <span className="text-gray-600">{feature}</span>
                          </div>
                        ))}
                        {plan.features.length > 3 && (
                          <p className="text-sm text-gray-500 italic">
                            +{plan.features.length - 3} more features
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="text-center">
            <Button variant="outline" onClick={retakeQuiz}>
              Retake Quiz
            </Button>
          </div>
        </div>
        
        {/* Contact Form Modal for Agent Enrollment */}
        <ContactFormModal 
          isOpen={showContactForm}
          onClose={() => setShowContactForm(false)}
          title={`Get Started with ${planInfo[selectedPlan as keyof typeof planInfo]?.name || 'MyPremierPlans'}`}
        />
      </div>
    );
  }

  const currentQ = quizQuestions[currentQuestion];
  const currentAnswer = answers[currentQ.id];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <Users className="mx-auto h-12 w-12 text-medical-blue-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Find Your Perfect Plan</h1>
          <p className="text-gray-600">Answer a few questions to get a personalized recommendation</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Question {currentQuestion + 1} of {quizQuestions.length}</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{currentQ.question}</CardTitle>
            {currentQ.description && (
              <p className="text-gray-600">{currentQ.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <RadioGroup 
              value={currentAnswer || ""} 
              onValueChange={(value) => handleAnswer(currentQ.id, value)}
              className="space-y-4"
            >
              {currentQ.options.map((option) => (
                <div key={option.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label 
                    htmlFor={option.value} 
                    className="flex-1 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex justify-between mt-8">
              <Button 
                variant="outline" 
                onClick={handlePrevious}
                disabled={currentQuestion === 0}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              
              <Button 
                onClick={handleNext}
                disabled={!currentAnswer}
                className="bg-white hover:bg-gray-100 text-black border border-gray-300 disabled:opacity-50"
              >
                {currentQuestion === quizQuestions.length - 1 ? "See Results" : "Next"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => setLocation('/')}>
            Skip Quiz - View All Plans
          </Button>
        </div>
      </div>
    </div>
  );
}