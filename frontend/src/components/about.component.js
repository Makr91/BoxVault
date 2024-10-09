import React, { useState, useEffect } from "react";
import UserService from "../services/user.service";

const About = () => {
  const [projectData, setProjectData] = useState({
    title: "",
    description: "",
    components: [],
    features: [],
    goal: ""
  });

  useEffect(() => {
    UserService.getPublicContent().then(
      (response) => {
        setProjectData(response.data);
      },
      (error) => {
        const _content =
          (error.response && error.response.data) ||
          error.message ||
          error.toString();

        setProjectData((prevData) => ({ ...prevData, title: _content }));
      }
    );
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">{projectData.title}</h1>
        <p className="description">{projectData.description}</p>

        {projectData.components.map((component, index) => (
          <section key={index} className="section">
            <h2 className="section-title">{component.title}</h2>
            <ul className="list">
              {component.details.map((detail, idx) => (
                <li key={idx} className="list-item">{detail}</li>
              ))}
            </ul>
          </section>
        ))}

        <h2 className="section-title">Key Features:</h2>
        <ul className="list">
          {projectData.features.map((feature, index) => (
            <li key={index} className="list-item">{feature}</li>
          ))}
        </ul>

        <p className="goal">{projectData.goal}</p>

        <section className="support-section">
          <h2 className="section-title">Support and Follow</h2>
          <ul className="list">
            <li className="list-item">
              <a href="https://www.patreon.com/Philotic" target="_blank" rel="noopener noreferrer" className="link">
                Support on Patreon
              </a>
            </li>
            <li className="list-item">
              <a href="https://github.com/makr91" target="_blank" rel="noopener noreferrer" className="link">
                GitHub Profile
              </a>
            </li>
            <li className="list-item">
              <a href="https://github.com/makr91/BoxVault" target="_blank" rel="noopener noreferrer" className="link">
                Project Repository
              </a>
            </li>
          </ul>
        </section>
      </header>
    </div>
  );
};

export default About;