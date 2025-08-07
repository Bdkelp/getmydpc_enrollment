import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Heart, DollarSign, Clock, UserCheck, Check, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ContactFormModal } from "@/components/contact-form-modal";
import type { Plan } from "@shared/schema";
import heroImage from "@assets/enrollment dr image_1752013719087.jpg";

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Heart className="text-medical-blue-600 h-8 w-8 mr-3" />
                <span className="text-xl font-bold text-gray-900">MyPremierPlans</span>
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
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-gray-600">
                    Welcome, {user?.firstName || user?.email}
                  </span>
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
                    variant="outline"
                    onClick={() => setLocation("/register")}
                  >
                    Create Account
                  </Button>
                  <Button 
                    className="bg-white hover:bg-gray-100 text-black border border-gray-300"
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
      <div className="bg-gradient-to-br from-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-6">
                Membership Has Never Been
                <span className="text-medical-blue-600"> So Easy</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Your health. Your membership. No insurance needed.
                Get unlimited access to your primary care physician for one low monthly fee.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  user?.role === "agent" || user?.role === "admin" ? (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link href="/registration">
                        <Button size="lg" className="bg-white hover:bg-gray-100 text-black border border-gray-300 px-8 py-4">
                          Enroll New Member
                        </Button>
                      </Link>
                      {user?.role === "admin" && (
                        <Link href="/admin">
                          <Button size="lg" variant="outline" className="px-8 py-4">
                            Admin Dashboard
                          </Button>
                        </Link>
                      )}
                      {user?.role === "agent" && (
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
            <div className="lg:pl-8">
              <img 
                src={heroImage} 
                alt="Doctor consultation with patient" 
                className="rounded-xl shadow-lg w-full h-auto object-cover"
                style={{ maxHeight: "600px" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="py-20 bg-white">
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
              <div key={index} className="text-center p-6">
                <div className="w-16 h-16 medical-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="text-medical-blue-600 h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plans Section */}
      <div id="plans" className="py-20 bg-gray-50">
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
                <Card key={plan.id} className={`relative p-8 hover:shadow-md transition-shadow ${
                  plan.name.toLowerCase().includes("family") ? "border-2 border-blue-600" : ""
                }`}>
                  {getPlanBadge(plan.name)}
                  <CardContent className="p-0">
                    <div className="text-center mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                      <div className="text-4xl font-bold text-medical-blue-600 mb-1">
                        ${plan.price}
                      </div>
                      <div className="text-gray-500">per month</div>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {getPlanFeatures(plan.name).map((feature, index) => (
                        <li key={index} className="flex items-center">
                          <Check className="text-green-500 h-5 w-5 mr-3" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {isAuthenticated ? (
                      user?.role === "agent" || user?.role === "admin" ? (
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
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What Our Members Are Saying</h2>
            <p className="text-lg text-gray-600">Real experiences from MyPremierPlans members</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <Card className="p-8">
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
            <Card className="p-8">
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
            <Card className="p-8">
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
    </div>
  );
}
