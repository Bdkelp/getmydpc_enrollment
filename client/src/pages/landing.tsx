import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DollarSign, Clock, UserCheck, Check, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ContactFormModal } from "@/components/contact-form-modal";
import { PartnerFormModal } from "@/components/partner-form-modal";
import type { Plan } from "@shared/schema";
import heroImage from "@assets/about-hero-compassionate-care.jpg";
import apiClient from "@/lib/apiClient";
import { hasAtLeastRole } from "@/lib/roles";

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const isAdminUser = hasAtLeastRole(user?.role, "admin");
  const isAgentOrAbove = hasAtLeastRole(user?.role, "agent");
  const [, setLocation] = useLocation();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = heroRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHeroVisible(true);
          }
        });
      },
      { threshold: 0.4 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  
  console.log('[Landing] Auth state:', { isAuthenticated, user: user?.email, role: user?.role });
  
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const benefits = [
    {
      icon: DollarSign,
      title: "Transparent Pricing",
      description: "No hidden fees, no surprise bills. One low monthly membership covers all your primary care needs.",
    },
    {
      icon: Clock,
      title: "24/7 Access",
      description: "Use the Patient advocate line (PAL) or the mobile app to access care when you need it. Same-day or next day appointments available when you need care.",
    },
    {
      icon: UserCheck,
      title: "Personal Care",
      description: "Build a real relationship with your doctor. Longer appointments, personalized attention.",
    },
  ];

  const getPlanBadge = (planName: string) => {
    if (planName.toLowerCase().includes("elite")) {
      return (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium">
            Premium
          </span>
        </div>
      );
    }
    if (planName.toLowerCase().includes("plus") || planName.toLowerCase().includes("+")) {
      return (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      );
    }
    return null;
  };

  const getPlanFeatures = (planName: string) => {
    // Extract plan tier from name
    const isBase = planName.toLowerCase().includes("base");
    const isPlus = planName.toLowerCase().includes("plus") || planName.toLowerCase().includes("+");
    const isElite = planName.toLowerCase().includes("elite");

    if (isBase) {
      return [
        "Unlimited virtual/telehealth visits",
        "Unlimited primary care office visits",
        "$10 office visit fee",
        "Access to Patient Advocate Line (PAL)",
        "Prescription coordination",
        "Wellcard benefits included"
      ];
    }

    if (isPlus) {
      return [
        "Unlimited virtual/telemed visits",
        "Unlimited in-office doctor visits",
        "$10 office visit fee",
        "Unlimited urgent care visits",
        "$25 urgent care visit fee",
        "Wellcard benefits included"
      ];
    }

    if (isElite) {
      return [
        "All Plus plan benefits",
        "NO office or visit fees",
        "200 Quest diagnostics procedures**",
        "**Restrictions apply",
        "Wellcard benefits included"
      ];
    }

    // Default to base features
    return [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ];
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-medical-blue-50/10 to-white">
      {/* Navigation Header */}
      <nav className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-50 animate-[fade-in-up_0.5s_ease-out]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <img
                  src="/mypremierplans-logo.png"
                  alt="MyPremierPlans logo"
                  className="h-14 sm:h-16 md:h-20 w-auto drop-shadow-md"
                />
              </div>
              <div className="hidden md:block ml-10">
                <div className="flex items-baseline space-x-4">
                  <a href="#home" className="text-medical-blue-600 px-3 py-2 text-sm font-medium">Home</a>
                  <a href="#plans" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Plans</a>
                  <a href="#about" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">About DPC</a>
                  <a href="https://www.mypremierplans.com/contactus" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Contact Us</a>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                onClick={() => setIsPartnerModalOpen(true)}
              >
                Partner with us
              </Button>
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-gray-600">
                    Welcome, {user?.firstName || user?.email}
                  </span>
                  {isAdminUser && (
                    <Button 
                      variant="default"
                      onClick={() => setLocation("/admin")}
                    >
                      Admin Dashboard
                    </Button>
                  )}
                  {isAgentOrAbove && (
                    <Button 
                      variant="default"
                      onClick={() => setLocation("/agent")}
                    >
                      Agent Dashboard
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      const { signOut } = await import("@/lib/supabase");
                      await signOut();
                      window.location.reload();
                    }}
                  >
                    Log Out
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={() => setLocation("/login")}
                  >
                    Sign In
                  </Button>
                  <Button 
                    className="bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                    onClick={() => setIsContactModalOpen(true)}
                  >
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-medical-blue-50 via-white to-medical-blue-50/20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div
              ref={heroRef}
              className="space-y-2"
            >
              <h1
                className={`text-4xl lg:text-6xl font-bold text-gray-900 leading-tight transform transition-all duration-700 ease-out ${
                  heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
                }`}
                style={{ transitionDelay: "0ms" }}
              >
                Real Doctors
              </h1>
              <h2
                className={`text-4xl lg:text-5xl font-semibold text-gray-900 leading-tight transform transition-all duration-700 ease-out ${
                  heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
                }`}
                style={{ transitionDelay: "120ms" }}
              >
                Real Access
              </h2>
              <h2
                className={`text-3xl lg:text-4xl font-semibold text-gray-800 leading-tight transform transition-all duration-700 ease-out ${
                  heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
                }`}
                style={{ transitionDelay: "240ms" }}
              >
                Real Simple
              </h2>
              <h3
                className={`text-2xl text-gray-700 font-medium mb-6 transform transition-all duration-700 ease-out ${
                  heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
                }`}
                style={{ transitionDelay: "360ms" }}
              >
                Membership has never been so easy.
              </h3>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  isAgentOrAbove ? (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link href="/registration">
                        <Button size="lg" className="bg-white hover:bg-gray-100 text-black border border-gray-300 px-8 py-4">
                          Enroll New Member
                        </Button>
                      </Link>
                      {isAdminUser && (
                        <Link href="/admin">
                          <Button size="lg" variant="outline" className="px-8 py-4">
                            Admin Dashboard
                          </Button>
                        </Link>
                      )}
                      {isAgentOrAbove && (
                        <Link href="/agent">
                          <Button size="lg" variant="outline" className="px-8 py-4">
                            Agent Dashboard
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-600">
                      <p>Please contact your agent to make enrollment changes.</p>
                      <p className="font-semibold mt-2">210-512-4318</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      size="lg" 
                      className="bg-white hover:bg-gray-100 text-black border border-gray-300 px-8 py-4"
                      onClick={() => setLocation('/quiz')}
                    >
                      Find My Perfect Plan
                    </Button>
                    <Button 
                      variant="outline"
                      size="lg" 
                      className="px-8 py-4"
                      onClick={() => setIsContactModalOpen(true)}
                    >
                      Contact an Agent
                    </Button>
                  </div>
                )}
                <a href="https://www.mypremierplans.com" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="lg" className="px-8 py-4">
                    Learn More
                  </Button>
                </a>
              </div>
            </div>
            <div className="lg:pl-8 animate-[scale-in_1s_ease-out]">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-medical-blue-500/10 to-medical-blue-600/10 rounded-2xl blur-3xl" />
                <img 
                  src={heroImage} 
                  alt="Doctor consultation with patient" 
                  className="relative rounded-2xl shadow-2xl w-full h-auto object-cover transform hover:scale-[1.02] transition-transform duration-500"
                  style={{ maxHeight: "600px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="py-24 bg-gradient-to-b from-white to-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose Direct Primary Care?</h2>
            <div className="max-w-3xl mx-auto">
              <p className="text-xl font-semibold text-gray-900 mb-2">Your Health. Your Membership. No Insurance Needed.</p>
              <p className="text-lg text-gray-600">
                Unlimited primary care. No copays. No surprises. Just quality healthcare membership that puts you first.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div 
                key={index} 
                className="text-center p-8 rounded-2xl hover:bg-white hover:shadow-xl transition-all duration-300 group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-20 h-20 bg-gradient-to-br from-medical-blue-100 to-medical-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <benefit.icon className="text-medical-blue-600 h-10 w-10" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plans Section */}
      <div id="plans" className="py-24 bg-gradient-to-b from-gray-50/50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Healthcare Membership</h2>
            <p className="text-lg text-gray-600">Flexible membership options for individuals and families</p>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {plans?.filter(plan => plan.name.includes("Member Only"))
                .sort((a, b) => {
                  // Sort by plan tier: Base, Plus, Elite
                  const tierOrder = { 'base': 1, 'plus': 2, '+': 2, 'elite': 3 };
                  const aTier = a.name.toLowerCase().includes('elite') ? 3 : 
                               a.name.toLowerCase().includes('plus') || a.name.includes('+') ? 2 : 1;
                  const bTier = b.name.toLowerCase().includes('elite') ? 3 : 
                               b.name.toLowerCase().includes('plus') || b.name.includes('+') ? 2 : 1;
                  return aTier - bTier;
                })
                .map((plan) => (
                <Card 
                  key={plan.id} 
                  className={`relative p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-gray-100 ${
                    plan.name.toLowerCase().includes("plus") || plan.name.includes("+") 
                      ? "border-2 border-medical-blue-500 shadow-xl scale-105" 
                      : ""
                  }`}
                  style={{ animationDelay: `${plans?.indexOf(plan) * 100}ms` }}
                >
                  {getPlanBadge(plan.name)}
                  <CardContent className="p-0">
                    <div className="text-center mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                      <div className="flex items-baseline justify-center">
                        <span className="text-5xl font-bold bg-gradient-to-r from-medical-blue-600 to-medical-blue-500 bg-clip-text text-transparent">
                          ${plan.price}
                        </span>
                        <span className="text-gray-500 ml-2">/month</span>
                      </div>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {getPlanFeatures(plan.name).map((feature, index) => (
                        <li key={index} className="flex items-center group/item">
                          <Check className="text-green-500 h-5 w-5 mr-3 flex-shrink-0 group-hover/item:scale-110 transition-transform" />
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {isAuthenticated ? (
                      isAgentOrAbove ? (
                        <Link href="/registration">
                          <Button 
                            className={`w-full ${
                              plan.name.toLowerCase().includes("group") 
                                ? "bg-white hover:bg-gray-50 text-medical-blue-600 border border-blue-600" 
                                : "bg-white hover:bg-gray-100 text-black border border-gray-300"
                            }`}
                          >
                            {plan.name.toLowerCase().includes("group") ? "Contact Sales" : "Select Membership"}
                          </Button>
                        </Link>
                      ) : (
                        <div className="text-center text-gray-600 py-3">
                          <p className="text-sm">Contact your agent to enroll</p>
                          <p className="font-semibold">210-512-4318</p>
                        </div>
                      )
                    ) : (
                      <Button 
                        className={`w-full ${
                          plan.name.toLowerCase().includes("group") 
                            ? "bg-white hover:bg-gray-50 text-medical-blue-600 border border-blue-600" 
                            : "bg-white hover:bg-gray-100 text-black border border-gray-300"
                        }`}
                        onClick={() => setIsContactModalOpen(true)}
                      >
                        {plan.name.toLowerCase().includes("group") ? "Contact Sales" : "Select Membership"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="py-24 bg-gradient-to-b from-white to-medical-blue-50/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What Our Members Are Saying</h2>
            <p className="text-lg text-gray-600">Real experiences from MyPremierPlans members</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <Card className="p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-0">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">
                  "Finally, healthcare that works for me! No more waiting weeks for appointments. 
                  My doctor actually knows my name and takes time to listen. The virtual visits 
                  have been a game-changer for my busy schedule."
                </p>
                <div className="flex items-center">
                  <div className="h-12 w-12 bg-gray-300 rounded-full mr-4"></div>
                  <div>
                    <p className="font-semibold text-gray-900">Sarah Johnson</p>
                    <p className="text-sm text-gray-600">Member since 2023</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 2 */}
            <Card className="p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-0">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">
                  "The $10 office visits and $25 urgent care visits have saved me hundreds compared 
                  to my old insurance copays. I am able to be seen same day or next day when I need care. 
                  It's healthcare membership how it should be!"
                </p>
                <div className="flex items-center">
                  <div className="h-12 w-12 bg-gray-300 rounded-full mr-4"></div>
                  <div>
                    <p className="font-semibold text-gray-900">Michael Chen</p>
                    <p className="text-sm text-gray-600">Member since 2022</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 3 */}
            <Card className="p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-0">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">
                  "Having the Elite plan with no visit fees and Quest diagnostics included has been 
                  incredible. My whole family is covered, and we actually use our healthcare now 
                  instead of avoiding it due to cost."
                </p>
                <div className="flex items-center">
                  <div className="h-12 w-12 bg-gray-300 rounded-full mr-4"></div>
                  <div>
                    <p className="font-semibold text-gray-900">Jennifer Martinez</p>
                    <p className="text-sm text-gray-600">Member since 2024</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Contact Form Modal */}
      <ContactFormModal 
        isOpen={isContactModalOpen} 
        onClose={() => setIsContactModalOpen(false)} 
      />
      <PartnerFormModal 
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
      />
    </div>
  );
}
